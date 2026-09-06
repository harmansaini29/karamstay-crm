output "alb_dns_name" {
  description = "Public DNS of the Application Load Balancer. Point your domain_name CNAME at this value."
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Hosted zone ID of the ALB, for Route 53 alias records."
  value       = aws_lb.main.zone_id
}

output "ecs_cluster_name" {
  description = "ECS cluster name — required for 'aws ecs update-service' in CI/CD."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name — required for 'aws ecs update-service' in CI/CD."
  value       = aws_ecs_service.app.name
}

output "ecr_repository_url" {
  description = "ECR repository URL that CI/CD should push Docker images to (tagged with git SHA)."
  value       = aws_ecr_repository.app.repository_url
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket used for KYC documents, agreements, and property photos."
  value       = aws_s3_bucket.app.bucket
}

output "rds_endpoint" {
  description = "RDS connection endpoint (host:port). Reachable only from within the VPC (ECS tasks)."
  value       = aws_db_instance.postgres.endpoint
}

output "rds_address" {
  description = "RDS hostname only (no port)."
  value       = aws_db_instance.postgres.address
}

output "github_actions_role_arn" {
  description = "ARN of the IAM role GitHub Actions assumes via OIDC. Set this as AWS_OIDC_ROLE_ARN in GitHub repo variables."
  value       = aws_iam_role.github_actions.arn
}

output "acm_certificate_validation_options" {
  description = "DNS CNAME records to add at your DNS provider to validate the ACM certificate. Add these before running 'terraform apply' on subsequent plans."
  value       = aws_acm_certificate.api.domain_validation_options
}

output "ssm_parameter_path_prefix" {
  description = "SSM parameter path prefix this app's secrets live under."
  value       = local.ssm_prefix
}

output "budget_alerts_sns_topic_arn" {
  description = "SNS topic ARN that AWS Budgets publishes to for cost alert emails."
  value       = aws_sns_topic.budget_alerts.arn
}

output "waf_web_acl_arn" {
  description = "ARN of the WAF Web ACL (empty string when enable_waf = false)."
  value       = var.enable_waf ? aws_wafv2_web_acl.app[0].arn : ""
}
