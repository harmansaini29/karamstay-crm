########################################################################
# KaramStay backend — production infrastructure
#
# Compute:   AWS App Runner (0.5 vCPU / 1 GB, min 1 / max 4 instances)
# Database:  RDS Postgres db.t4g.small, single-AZ, 30GB -> 200GB autoscale
# Network:   Private-only VPC (no NAT/IGW) + VPC connector + S3 gateway
#            endpoint. App Runner's normal public egress path (unaffected
#            by the VPC connector) is what reaches WhatsApp/Firebase; the
#            VPC connector is only used for App Runner -> RDS traffic.
# Secrets:   SSM Parameter Store, SecureString, Standard tier (free)
# Storage:   One S3 bucket, versioning off, abort-incomplete-upload rule
# Guardrails: AWS Budgets (SNS+email), WAF rate limiting, 30-day log
#             retention, least-privilege App Runner instance role
########################################################################

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

# Default AWS-managed KMS key that SSM SecureString parameters encrypt with
# unless a customer-managed key is specified. The App Runner instance role
# needs kms:Decrypt against the concrete key ARN (not just the alias) to be
# able to read our SecureString parameters at container startup.
data "aws_kms_alias" "ssm" {
  name = "alias/aws/ssm"
}

locals {
  name_prefix = "${var.app_name}-${var.environment}"
  ssm_prefix  = "/${var.app_name}/${var.environment}"

  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  database_url = "postgresql+psycopg://${var.db_username}:${random_password.db.result}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${var.db_name}"

  # Secrets Terraform can compute itself because it owns the upstream value
  # (the RDS password it just generated, a freshly generated signing key).
  # These are written to SSM in full — no placeholder needed.
  computed_secrets = {
    database_url   = local.database_url
    jwt_secret_key = random_password.jwt_secret.result
  }

  # Secrets that come from a third party (Meta/WhatsApp, Firebase) that
  # Terraform has no way to know. These are seeded with an obvious
  # placeholder so `terraform apply` never silently ships an empty/blank
  # secret — see infra/runbook.md for how to fill in the real values via
  # `aws ssm put-parameter --overwrite` after apply. `ignore_changes` on
  # these resources means Terraform won't stomp the real value back to the
  # placeholder on a later apply.
  external_secrets = {
    whatsapp_cloud_api_token      = "REPLACE_ME"
    whatsapp_phone_number_id      = "REPLACE_ME"
    firebase_service_account_json = "REPLACE_ME"
  }

  apprunner_log_groups = [
    "/aws/apprunner/${local.name_prefix}/${aws_apprunner_service.app.service_id}/application",
    "/aws/apprunner/${local.name_prefix}/${aws_apprunner_service.app.service_id}/service",
  ]
}

########################################
# Networking — private-only VPC
########################################

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${local.name_prefix}-vpc" }
}

resource "aws_subnet" "private" {
  count             = length(var.private_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = { Name = "${local.name_prefix}-private-${count.index}" }
}

# No NAT Gateway, no Internet Gateway: this app doesn't need one. RDS is
# reached over the VPC connector; S3 is reached via the gateway endpoint
# below; everything else (WhatsApp, Firebase) goes over App Runner's normal
# public egress path, which is untouched by attaching a VPC connector.
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${local.name_prefix}-private-rt" }
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# Free S3 Gateway VPC Endpoint so the App Runner instance role's S3 traffic
# (Legal Vault documents) never needs to leave the AWS network.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]

  tags = { Name = "${local.name_prefix}-s3-endpoint" }
}

resource "aws_security_group" "apprunner_connector" {
  name        = "${local.name_prefix}-apprunner-connector"
  description = "App Runner VPC connector ENIs"
  vpc_id      = aws_vpc.main.id

  egress {
    description = "All outbound (RDS on 5432, S3 gateway endpoint, etc.)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-apprunner-connector-sg" }
}

resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds"
  description = "RDS Postgres — inbound only from the App Runner VPC connector"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres from App Runner VPC connector"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.apprunner_connector.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-rds-sg" }
}

resource "aws_apprunner_vpc_connector" "this" {
  vpc_connector_name = "${local.name_prefix}-connector"
  subnets            = aws_subnet.private[*].id
  security_groups    = [aws_security_group.apprunner_connector.id]
}

########################################
# Database — RDS Postgres
########################################

resource "aws_db_subnet_group" "this" {
  name       = "${local.name_prefix}-db-subnets"
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${local.name_prefix}-db-subnets" }
}

resource "random_password" "db" {
  length  = 32
  special = true
  # Keep the charset URL-safe so it drops straight into DATABASE_URL without
  # needing percent-encoding.
  override_special = "-_"
}

resource "aws_db_instance" "postgres" {
  identifier     = "${local.name_prefix}-db"
  engine         = "postgres"
  engine_version = var.db_engine_version

  instance_class        = var.db_instance_class
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result
  port     = 5432

  multi_az               = false
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  backup_retention_period   = var.db_backup_retention_period
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name_prefix}-db-final"
  deletion_protection       = true

  tags = { Name = "${local.name_prefix}-db" }
}

########################################
# Storage — S3 (Legal Vault documents)
########################################

resource "aws_s3_bucket" "app" {
  bucket = "${local.name_prefix}-app-storage-${data.aws_caller_identity.current.account_id}"

  tags = { Name = "${local.name_prefix}-app-storage" }
}

resource "aws_s3_bucket_versioning" "app" {
  bucket = aws_s3_bucket.app.id
  versioning_configuration {
    status = "Disabled"
  }
}

resource "aws_s3_bucket_public_access_block" "app" {
  bucket                  = aws_s3_bucket.app.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "app" {
  bucket = aws_s3_bucket.app.id

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

########################################
# Secrets — SSM Parameter Store (SecureString)
########################################

resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}

resource "aws_ssm_parameter" "computed_secret" {
  for_each = local.computed_secrets

  name  = "${local.ssm_prefix}/${each.key}"
  type  = "SecureString"
  value = each.value

  tags = { Name = "${local.ssm_prefix}/${each.key}" }
}

resource "aws_ssm_parameter" "external_secret" {
  for_each = local.external_secrets

  name        = "${local.ssm_prefix}/${each.key}"
  type        = "SecureString"
  value       = each.value
  description = "REPLACE ME after apply — see infra/runbook.md. Placeholder value, not a real secret."

  lifecycle {
    ignore_changes = [value]
  }

  tags = { Name = "${local.ssm_prefix}/${each.key}" }
}

########################################
# IAM — App Runner ECR access role + least-privilege instance role
########################################

data "aws_iam_policy_document" "apprunner_ecr_access_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["build.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "apprunner_ecr_access" {
  name               = "${local.name_prefix}-apprunner-ecr-access"
  assume_role_policy = data.aws_iam_policy_document.apprunner_ecr_access_assume.json
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr_access" {
  role       = aws_iam_role.apprunner_ecr_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

data "aws_iam_policy_document" "apprunner_instance_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["tasks.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "apprunner_instance" {
  name               = "${local.name_prefix}-apprunner-instance"
  assume_role_policy = data.aws_iam_policy_document.apprunner_instance_assume.json
}

data "aws_iam_policy_document" "apprunner_instance" {
  # Read-only access to this app's own SSM parameter path — nothing else.
  statement {
    sid    = "ReadOwnSsmParameters"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
    ]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}/*",
    ]
  }

  # Decrypt permission for the default AWS-managed SSM KMS key, required for
  # App Runner to resolve SecureString runtime_environment_secrets.
  statement {
    sid       = "DecryptSsmDefaultKey"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = [data.aws_kms_alias.ssm.target_key_arn]
  }

  # Read/write to this app's own S3 bucket only — nothing else.
  statement {
    sid       = "ListOwnBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.app.arn]
  }

  statement {
    sid    = "ReadWriteOwnBucketObjects"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["${aws_s3_bucket.app.arn}/*"]
  }
}

resource "aws_iam_policy" "apprunner_instance" {
  name   = "${local.name_prefix}-apprunner-instance-policy"
  policy = data.aws_iam_policy_document.apprunner_instance.json
}

resource "aws_iam_role_policy_attachment" "apprunner_instance" {
  role       = aws_iam_role.apprunner_instance.name
  policy_arn = aws_iam_policy.apprunner_instance.arn
}

########################################
# Container registry
########################################

resource "aws_ecr_repository" "app" {
  name                 = "${local.name_prefix}-backend"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep the last 20 images, expire the rest"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 20
        }
        action = { type = "expire" }
      }
    ]
  })
}

########################################
# App Runner — auto scaling configuration + service
########################################

resource "aws_apprunner_auto_scaling_configuration_version" "this" {
  auto_scaling_configuration_name = "${local.name_prefix}-autoscaling"
  min_size                        = var.apprunner_min_size
  max_size                        = var.apprunner_max_size
  max_concurrency                 = var.apprunner_max_concurrency
}

resource "aws_apprunner_service" "app" {
  service_name = local.name_prefix

  source_configuration {
    # CI/CD (see .github/workflows/backend-ci-cd.yml) explicitly triggers
    # deployments to new git-SHA image tags after tests pass and a human
    # approves the "production" GitHub Environment — auto_deployments_enabled
    # is off so nothing redeploys itself outside of that reviewed pipeline.
    auto_deployments_enabled = false

    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access.arn
    }

    image_repository {
      image_identifier      = "${aws_ecr_repository.app.repository_url}:${var.ecr_image_tag}"
      image_repository_type = "ECR"

      image_configuration {
        port = "8000"

        runtime_environment_variables = {
          APP_NAME                        = var.app_display_name
          ENVIRONMENT                     = var.environment
          JWT_ALGORITHM                   = var.jwt_algorithm
          ACCESS_TOKEN_EXPIRE_MINUTES     = tostring(var.access_token_expire_minutes)
          REFRESH_TOKEN_EXPIRE_DAYS       = tostring(var.refresh_token_expire_days)
          BACKEND_CORS_ORIGINS            = var.backend_cors_origins
          WHATSAPP_API_BASE_URL           = var.whatsapp_api_base_url
          AWS_S3_BUCKET                   = aws_s3_bucket.app.bucket
          AWS_REGION                      = var.aws_region
          S3_PRESIGNED_URL_EXPIRE_SECONDS = tostring(var.s3_presigned_url_expire_seconds)
          RATE_LIMIT_ENABLED              = tostring(var.rate_limit_enabled)
          OTP_EXPIRE_MINUTES              = tostring(var.otp_expire_minutes)
          OTP_LENGTH                      = tostring(var.otp_length)
          LATE_FEE_GRACE_DAYS             = tostring(var.late_fee_grace_days)
          LATE_FEE_PERCENT_PER_DAY        = var.late_fee_percent_per_day
          INVOICE_GENERATION_DAY          = tostring(var.invoice_generation_day)
          LOG_LEVEL                       = var.app_log_level
          # AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are intentionally NOT
          # set: boto3 picks up credentials from the App Runner instance
          # role automatically, which is scoped to only this app's S3
          # bucket (see aws_iam_policy.apprunner_instance above). That's
          # strictly more secure than shipping a static IAM key pair.
        }

        runtime_environment_secrets = {
          DATABASE_URL                  = aws_ssm_parameter.computed_secret["database_url"].arn
          JWT_SECRET_KEY                = aws_ssm_parameter.computed_secret["jwt_secret_key"].arn
          WHATSAPP_CLOUD_API_TOKEN      = aws_ssm_parameter.external_secret["whatsapp_cloud_api_token"].arn
          WHATSAPP_PHONE_NUMBER_ID      = aws_ssm_parameter.external_secret["whatsapp_phone_number_id"].arn
          FIREBASE_SERVICE_ACCOUNT_JSON = aws_ssm_parameter.external_secret["firebase_service_account_json"].arn
        }
      }
    }
  }

  instance_configuration {
    cpu               = var.apprunner_cpu
    memory            = var.apprunner_memory
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.this.arn
    }
    ingress_configuration {
      is_publicly_accessible = true
    }
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/healthz"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.this.arn

  tags = { Name = local.name_prefix }
}

########################################
# Custom domain — App Runner manages its own ACM certificate internally;
# there's no certificate ARN to hand it. It exposes DNS records to add via
# certificate_validation_records / dns_target (see outputs.tf).
########################################

resource "aws_apprunner_custom_domain_association" "this" {
  domain_name          = var.domain_name
  service_arn          = aws_apprunner_service.app.arn
  enable_www_subdomain = var.enable_www_subdomain
}

########################################
# CloudWatch Logs retention
#
# App Runner auto-creates its own "application" and "service" log groups
# (with "Never expire" retention) the moment the service completes its
# first deployment — Terraform can't create them itself (they'd already
# exist) or know their names up front (the name embeds the AWS-assigned
# service_id). Setting retention is therefore done via the AWS CLI right
# after the service exists. Requires the `aws` CLI on the machine running
# `terraform apply`. If this errors because the log groups don't exist yet
# (first deployment still in progress), just re-run `terraform apply` — it
# is idempotent.
########################################

resource "null_resource" "log_retention" {
  # NOTE: this must be `count` (a static literal), not `for_each` over
  # local.apprunner_log_groups — those strings embed
  # aws_apprunner_service.app.service_id, which is unknown until the service
  # is actually created. for_each requires its *keys* to be fully known at
  # plan time even when the values inside are computed, so for_each here
  # would fail with "Invalid for_each argument" on the first apply. `count`
  # only needs the count *number* to be known, which "2" trivially is.
  count = length(local.apprunner_log_groups)

  triggers = {
    service_id = aws_apprunner_service.app.service_id
    days       = var.cloudwatch_log_retention_days
  }

  provisioner "local-exec" {
    command = "aws logs put-retention-policy --region ${var.aws_region} --log-group-name \"${local.apprunner_log_groups[count.index]}\" --retention-in-days ${var.cloudwatch_log_retention_days}"
  }

  depends_on = [aws_apprunner_service.app]
}

########################################
# WAF — rate limiting in front of App Runner
########################################

resource "aws_wafv2_web_acl" "app" {
  name        = "${local.name_prefix}-waf"
  description = "Rate limiting for the KaramStay App Runner service"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "rate-limit-per-ip"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = var.waf_rate_limit_requests
        evaluation_window_sec = var.waf_rate_limit_window_seconds
        aggregate_key_type    = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-waf"
    sampled_requests_enabled   = true
  }

  tags = { Name = "${local.name_prefix}-waf" }
}

resource "aws_wafv2_web_acl_association" "app" {
  resource_arn = aws_apprunner_service.app.arn
  web_acl_arn  = aws_wafv2_web_acl.app.arn
}

########################################
# Cost guardrails — AWS Budgets + SNS + email
########################################

resource "aws_sns_topic" "budget_alerts" {
  name = "${local.name_prefix}-budget-alerts"
}

data "aws_iam_policy_document" "budget_alerts_sns" {
  statement {
    sid     = "AllowBudgetsPublish"
    effect  = "Allow"
    actions = ["sns:Publish"]
    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }
    resources = [aws_sns_topic.budget_alerts.arn]
  }
}

resource "aws_sns_topic_policy" "budget_alerts" {
  arn    = aws_sns_topic.budget_alerts.arn
  policy = data.aws_iam_policy_document.budget_alerts_sns.json
}

resource "aws_sns_topic_subscription" "budget_alerts_email" {
  topic_arn = aws_sns_topic.budget_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_budgets_budget" "monthly" {
  name         = "${local.name_prefix}-monthly-budget"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = var.budget_threshold_low_usd
    threshold_type            = "ABSOLUTE_VALUE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.budget_alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = var.budget_threshold_medium_usd
    threshold_type            = "ABSOLUTE_VALUE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.budget_alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = var.budget_threshold_high_usd
    threshold_type            = "ABSOLUTE_VALUE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.budget_alerts.arn]
  }

  depends_on = [aws_sns_topic_policy.budget_alerts]
}
