########################################
# Core / naming
########################################

variable "aws_region" {
  description = "AWS region to deploy into. ap-south-1 (Mumbai) is closest to KaramStay's userbase in India."
  type        = string
  default     = "ap-south-1"
}

variable "aws_account_id" {
  description = "Your AWS account ID (12-digit number). Used to scope IAM resources and S3 bucket names."
  type        = string
  default     = "907079642634"
}

variable "app_name" {
  description = "Short name used to prefix/tag all resources."
  type        = string
  default     = "karamstay"
}

variable "environment" {
  description = "Deployment environment name, used in resource names, tags, and SSM paths."
  type        = string
  default     = "prod"
}

########################################
# Custom domain / TLS
########################################

variable "domain_name" {
  description = "Custom domain for the ALB (e.g. api.karamstay.com). Used for ACM certificate."
  type        = string
}

variable "enable_www_subdomain" {
  description = "Whether to also create a www. subdomain certificate SAN."
  type        = bool
  default     = false
}

variable "enable_https" {
  description = "Set to true once your custom domain DNS CNAME validation records are added and the ACM certificate is ISSUED. When false (default), ALB serves traffic on port 80 directly."
  type        = bool
  default     = false
}

########################################
# Alerting / budgets
########################################

variable "alert_email" {
  description = "Email address that receives AWS Budgets alerts via SNS."
  type        = string
}

variable "budget_threshold_low_usd" {
  type    = number
  default = 25
}

variable "budget_threshold_medium_usd" {
  type    = number
  default = 50
}

variable "budget_threshold_high_usd" {
  type    = number
  default = 75
}

variable "monthly_budget_limit_usd" {
  type    = number
  default = 100
}

########################################
# WAF (disabled by default to save ~5 USD/mo)
########################################

variable "enable_waf" {
  description = "Set true to attach WAFv2 WebACL rate limiting in front of the ALB. Adds ~5 USD/month."
  type        = bool
  default     = false
}

variable "waf_rate_limit_requests" {
  type    = number
  default = 700
}

variable "waf_rate_limit_window_seconds" {
  type    = number
  default = 300
}

########################################
# Networking
########################################

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (ECS tasks + ALB). Zero NAT Gateway cost."
  type        = list(string)
  default     = ["10.20.10.0/24", "10.20.11.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (RDS only)."
  type        = list(string)
  default     = ["10.20.1.0/24", "10.20.2.0/24"]
}

########################################
# Database (RDS Postgres)
########################################

variable "db_instance_class" {
  description = "RDS instance class. db.t4g.micro is Free-Tier eligible for 12 months."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_engine_version" {
  type    = string
  default = "16"
}

variable "db_allocated_storage" {
  description = "Initial SSD storage in GiB. Free Tier includes 20 GiB."
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  type    = number
  default = 100
}

variable "db_backup_retention_period" {
  type    = number
  default = 1
}

variable "db_name" {
  type    = string
  default = "karamstay"
}

variable "db_username" {
  type    = string
  default = "karamstay"
}

########################################
# ECS Fargate (compute)
########################################

variable "ecs_cpu" {
  description = "Fargate task CPU units (256 = 0.25 vCPU)."
  type        = string
  default     = "256"
}

variable "ecs_memory" {
  description = "Fargate task memory in MiB (512 = 0.5 GB)."
  type        = string
  default     = "512"
}

variable "ecs_desired_count" {
  description = "Number of running ECS Fargate tasks."
  type        = number
  default     = 1
}

variable "ecr_image_tag" {
  description = "Bootstrap Docker image tag. CI/CD moves to git-SHA tags after first deploy."
  type        = string
  default     = "latest"
}

########################################
# GitHub OIDC (CI/CD keyless auth)
########################################

variable "github_repository" {
  description = "GitHub repo 'owner/repo' that GitHub Actions deploys from."
  type        = string
  default     = "harmansaini29/karamstay-crm"
}

########################################
# Observability
########################################

variable "cloudwatch_log_retention_days" {
  type    = number
  default = 30
}

########################################
# Application configuration (non-secret)
########################################

variable "app_display_name" {
  type    = string
  default = "KaramStay"
}

variable "jwt_algorithm" {
  type    = string
  default = "HS256"
}

variable "access_token_expire_minutes" {
  type    = number
  default = 15
}

variable "refresh_token_expire_days" {
  type    = number
  default = 30
}

variable "backend_cors_origins" {
  type    = string
  default = "[]"
}

variable "whatsapp_api_base_url" {
  type    = string
  default = "https://graph.facebook.com/v20.0"
}

variable "s3_presigned_url_expire_seconds" {
  type    = number
  default = 300
}

variable "rate_limit_enabled" {
  type    = bool
  default = true
}

variable "otp_expire_minutes" {
  type    = number
  default = 10
}

variable "otp_length" {
  type    = number
  default = 6
}

variable "late_fee_grace_days" {
  type    = number
  default = 3
}

variable "late_fee_percent_per_day" {
  type    = string
  default = "1.0"
}

variable "invoice_generation_day" {
  type    = number
  default = 1
}

variable "app_log_level" {
  type    = string
  default = "INFO"
}
