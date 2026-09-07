########################################################################
# KaramStay backend â€” production infrastructure
#
# Compute:   Amazon ECS (Fargate) â€” 0.25 vCPU / 0.5 GB, 1 task, no
#            cold-start latency; APScheduler cron jobs run 24/7.
# Network:   VPC with public subnets (ALB + ECS) and private subnets
#            (RDS). Internet Gateway in public subnets â€” zero NAT
#            Gateway fees. S3 reached via free Gateway Endpoint.
# Database:  RDS Postgres db.t4g.micro, 20 GB gp3, Free Tier eligible.
# Registry:  Amazon ECR (immutable tags, scan on push, 20-image limit).
# Secrets:   SSM Parameter Store SecureString (permanently free).
# Storage:   S3 bucket â€” private, lifecycle rule for incomplete uploads.
# CI/CD:     GitHub Actions OIDC â€” no static AWS keys anywhere.
# Guard:     AWS Budgets (SNS + email), optional WAF, 30-day log retention.
########################################################################

data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" { state = "available" }
data "aws_kms_alias" "ssm" { name = "alias/aws/ssm" }

locals {
  name_prefix = "${var.app_name}-${var.environment}"
  ssm_prefix  = "/${var.app_name}/${var.environment}"
  azs         = slice(data.aws_availability_zones.available.names, 0, 2)

  database_url = "postgresql+psycopg://${var.db_username}:${random_password.db.result}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${var.db_name}"

  computed_secrets = {
    database_url   = local.database_url
    jwt_secret_key = random_password.jwt_secret.result
  }

  external_secrets = {
    whatsapp_cloud_api_token      = "REPLACE_ME"
    whatsapp_phone_number_id      = "REPLACE_ME"
    firebase_service_account_json = "REPLACE_ME"
  }
}

########################################
# Networking â€” VPC, public + private subnets, IGW
# Zero NAT Gateway (saves ~32 USD/month)
########################################

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = { Name = "${local.name_prefix}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name_prefix}-igw" }
}

# Public subnets â€” ALB and ECS Fargate tasks live here
resource "aws_subnet" "public" {
  count                   = length(var.public_subnet_cidrs)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true
  tags = { Name = "${local.name_prefix}-public-${count.index}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "${local.name_prefix}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private subnets â€” RDS only, unreachable from the internet
resource "aws_subnet" "private" {
  count             = length(var.private_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]
  tags = { Name = "${local.name_prefix}-private-${count.index}" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name_prefix}-private-rt" }
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# Free S3 Gateway Endpoint â€” ECS tasks reach S3 without internet egress
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.public.id, aws_route_table.private.id]
  tags = { Name = "${local.name_prefix}-s3-endpoint" }
}

########################################
# Security Groups
########################################

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb"
  description = "Application Load Balancer - allow HTTP/HTTPS from internet"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP from internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound to ECS tasks"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-alb-sg" }
}

resource "aws_security_group" "ecs_tasks" {
  name        = "${local.name_prefix}-ecs-tasks"
  description = "ECS Fargate tasks - inbound only from ALB on 8000, outbound all"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "FastAPI from ALB"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "All outbound - RDS, S3 endpoint, ECR, SSM, WhatsApp, Firebase"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-ecs-tasks-sg" }
}

resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds"
  description = "RDS Postgres - inbound only from ECS tasks on 5432"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres from ECS tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-rds-sg" }
}

########################################
# Application Load Balancer + ACM
########################################

resource "aws_acm_certificate" "api" {
  domain_name               = var.domain_name
  subject_alternative_names = var.enable_www_subdomain ? ["www.${var.domain_name}"] : []
  validation_method         = "DNS"
  lifecycle { create_before_destroy = true }
  tags = { Name = "${local.name_prefix}-cert" }
}

resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  tags               = { Name = "${local.name_prefix}-alb" }
}

resource "aws_lb_target_group" "app" {
  name        = "${local.name_prefix}-tg"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/healthz"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = { Name = "${local.name_prefix}-tg" }
}

# Port 80 listener: forwards directly to backend during bootstrap,
# or redirects to HTTPS once enable_https is turned on
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = var.enable_https ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = var.enable_https ? [] : [1]
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.app.arn
    }
  }
}

# Port 443 HTTPS listener: created only when enable_https = true
# (after ACM certificate is validated in DNS)
resource "aws_lb_listener" "https" {
  count             = var.enable_https ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.api.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

########################################
# Database â€” RDS Postgres
########################################

resource "aws_db_subnet_group" "this" {
  name       = "${local.name_prefix}-db-subnets"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "${local.name_prefix}-db-subnets" }
}

resource "random_password" "db" {
  length           = 32
  special          = true
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
# Storage â€” S3 (photos, KYC docs, agreements)
########################################

resource "aws_s3_bucket" "app" {
  bucket = "${local.name_prefix}-app-storage-${data.aws_caller_identity.current.account_id}"
  tags   = { Name = "${local.name_prefix}-app-storage" }
}

resource "aws_s3_bucket_versioning" "app" {
  bucket = aws_s3_bucket.app.id
  versioning_configuration { status = "Disabled" }
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
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
}

########################################
# Secrets â€” SSM Parameter Store (permanently free)
########################################

resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}

resource "aws_ssm_parameter" "computed_secret" {
  for_each = local.computed_secrets
  name     = "${local.ssm_prefix}/${each.key}"
  type     = "SecureString"
  value    = each.value
  tags     = { Name = "${local.ssm_prefix}/${each.key}" }
}

resource "aws_ssm_parameter" "external_secret" {
  for_each    = local.external_secrets
  name        = "${local.ssm_prefix}/${each.key}"
  type        = "SecureString"
  value       = each.value
  description = "REPLACE ME after apply - see infra/runbook.md"
  lifecycle { ignore_changes = [value] }
  tags = { Name = "${local.ssm_prefix}/${each.key}" }
}

########################################
# Container Registry â€” Amazon ECR
########################################

resource "aws_ecr_repository" "app" {
  name                 = "${local.name_prefix}-backend"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 20 images, expire the rest"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 20 }
      action       = { type = "expire" }
    }]
  })
}

########################################
# IAM â€” ECS Execution Role (pull ECR, write logs)
########################################

data "aws_iam_policy_document" "ecs_execution_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${local.name_prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_execution_assume.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow execution role to fetch SSM SecureString secrets at container start
data "aws_iam_policy_document" "ecs_execution_ssm" {
  statement {
    sid     = "ReadSsmSecrets"
    effect  = "Allow"
    actions = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}/*"
    ]
  }
  statement {
    sid       = "DecryptSsmKey"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = [data.aws_kms_alias.ssm.target_key_arn]
  }
}

resource "aws_iam_policy" "ecs_execution_ssm" {
  name   = "${local.name_prefix}-ecs-execution-ssm"
  policy = data.aws_iam_policy_document.ecs_execution_ssm.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution_ssm" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = aws_iam_policy.ecs_execution_ssm.arn
}

########################################
# IAM â€” ECS Task Role (least-privilege S3 + SSM at runtime)
########################################

data "aws_iam_policy_document" "ecs_task_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task" {
  name               = "${local.name_prefix}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
}

data "aws_iam_policy_document" "ecs_task" {
  statement {
    sid    = "ListOwnBucket"
    effect = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.app.arn]
  }
  statement {
    sid    = "ReadWriteOwnBucketObjects"
    effect = "Allow"
    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.app.arn}/*"]
  }
  statement {
    sid    = "ReadOwnSsmParameters"
    effect = "Allow"
    actions = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.ssm_prefix}/*"
    ]
  }
  statement {
    sid       = "DecryptSsmKey"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = [data.aws_kms_alias.ssm.target_key_arn]
  }
}

resource "aws_iam_policy" "ecs_task" {
  name   = "${local.name_prefix}-ecs-task-policy"
  policy = data.aws_iam_policy_document.ecs_task.json
}

resource "aws_iam_role_policy_attachment" "ecs_task" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.ecs_task.arn
}

########################################
# GitHub Actions OIDC â€” keyless CI/CD
# No static AWS access keys stored anywhere
########################################

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com", "https://github.com/aws-actions/configure-aws-credentials"]
  thumbprint_list = [
    "227203b5317f3818cab5b5ce596132bf36748c0e",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
    "6938fd4d98bab03faadb97b34396831e3780aea1",
  ]
}

data "aws_iam_policy_document" "github_actions_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:*"]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name               = "${local.name_prefix}-github-actions"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume.json
}

data "aws_iam_policy_document" "github_actions" {
  statement {
    sid    = "ECRAuth"
    effect = "Allow"
    actions = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid    = "ECRPush"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [aws_ecr_repository.app.arn]
  }
  statement {
    sid    = "ECSDeployUpdate"
    effect = "Allow"
    actions = [
      "ecs:UpdateService",
      "ecs:DescribeServices",
      "ecs:RegisterTaskDefinition",
      "ecs:DescribeTaskDefinition",
      "ecs:TagResource",
    ]
    resources = ["*"]
  }
  statement {
    sid    = "PassTaskRoles"
    effect = "Allow"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.ecs_execution.arn, aws_iam_role.ecs_task.arn]
  }
}

resource "aws_iam_policy" "github_actions" {
  name   = "${local.name_prefix}-github-actions-policy"
  policy = data.aws_iam_policy_document.github_actions.json
}

resource "aws_iam_role_policy_attachment" "github_actions" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.github_actions.arn
}

########################################
# CloudWatch Log Group for ECS
########################################

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name_prefix}"
  retention_in_days = var.cloudwatch_log_retention_days
  tags              = { Name = "${local.name_prefix}-logs" }
}

########################################
# ECS Cluster + Fargate Service
########################################

resource "aws_ecs_cluster" "main" {
  name = local.name_prefix
  setting {
    name  = "containerInsights"
    value = "disabled"
  }
  tags = { Name = local.name_prefix }
}

resource "aws_ecs_task_definition" "app" {
  family                   = local.name_prefix
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_cpu
  memory                   = var.ecs_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "api"
    image     = "${aws_ecr_repository.app.repository_url}:${var.ecr_image_tag}"
    essential = true

    portMappings = [{ containerPort = 8000, hostPort = 8000, protocol = "tcp" }]

    environment = [
      { name = "APP_NAME",                        value = var.app_display_name },
      { name = "ENVIRONMENT",                     value = var.environment },
      { name = "JWT_ALGORITHM",                   value = var.jwt_algorithm },
      { name = "ACCESS_TOKEN_EXPIRE_MINUTES",     value = tostring(var.access_token_expire_minutes) },
      { name = "REFRESH_TOKEN_EXPIRE_DAYS",       value = tostring(var.refresh_token_expire_days) },
      { name = "BACKEND_CORS_ORIGINS",            value = var.backend_cors_origins },
      { name = "WHATSAPP_API_BASE_URL",           value = var.whatsapp_api_base_url },
      { name = "AWS_S3_BUCKET",                   value = aws_s3_bucket.app.bucket },
      { name = "AWS_REGION",                      value = var.aws_region },
      { name = "S3_PRESIGNED_URL_EXPIRE_SECONDS", value = tostring(var.s3_presigned_url_expire_seconds) },
      { name = "RATE_LIMIT_ENABLED",              value = tostring(var.rate_limit_enabled) },
      { name = "OTP_EXPIRE_MINUTES",              value = tostring(var.otp_expire_minutes) },
      { name = "OTP_LENGTH",                      value = tostring(var.otp_length) },
      { name = "LATE_FEE_GRACE_DAYS",             value = tostring(var.late_fee_grace_days) },
      { name = "LATE_FEE_PERCENT_PER_DAY",        value = var.late_fee_percent_per_day },
      { name = "INVOICE_GENERATION_DAY",          value = tostring(var.invoice_generation_day) },
      { name = "LOG_LEVEL",                       value = var.app_log_level },
    ]

    secrets = [
      { name = "DATABASE_URL",                  valueFrom = aws_ssm_parameter.computed_secret["database_url"].arn },
      { name = "JWT_SECRET_KEY",                valueFrom = aws_ssm_parameter.computed_secret["jwt_secret_key"].arn },
      { name = "WHATSAPP_CLOUD_API_TOKEN",      valueFrom = aws_ssm_parameter.external_secret["whatsapp_cloud_api_token"].arn },
      { name = "WHATSAPP_PHONE_NUMBER_ID",      valueFrom = aws_ssm_parameter.external_secret["whatsapp_phone_number_id"].arn },
      { name = "FIREBASE_SERVICE_ACCOUNT_JSON", valueFrom = aws_ssm_parameter.external_secret["firebase_service_account_json"].arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "app" {
  name            = "${local.name_prefix}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.ecs_desired_count
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "api"
    container_port   = 8000
  }

  lifecycle {
    ignore_changes = [task_definition]
  }

  depends_on = [aws_lb_listener.http, aws_iam_role_policy_attachment.ecs_execution_managed]
}

########################################
# WAF v2 â€” optional, default off (saves ~5 USD/mo)
########################################

resource "aws_wafv2_web_acl" "app" {
  count       = var.enable_waf ? 1 : 0
  name        = "${local.name_prefix}-waf"
  description = "Rate limiting for KaramStay ALB"
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
  count        = var.enable_waf ? 1 : 0
  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.app[0].arn
}

########################################
# Cost guardrails â€” AWS Budgets + SNS + email
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

