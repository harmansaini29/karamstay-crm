output "apprunner_service_url" {
  description = "Default *.awsapprunner.com URL for the service (works immediately, before DNS/custom domain is configured)."
  value       = "https://${aws_apprunner_service.app.service_url}"
}

output "apprunner_service_arn" {
  description = "ARN of the App Runner service — needed for `aws apprunner` CLI calls in CI/CD and for manual rollback."
  value       = aws_apprunner_service.app.arn
}

output "ecr_repository_url" {
  description = "ECR repository URL that CI/CD should push images to (tag with the git SHA)."
  value       = aws_ecr_repository.app.repository_url
}

output "rds_endpoint" {
  description = "RDS connection endpoint (host:port). Not internet-reachable — only resolvable/reachable from inside the VPC (i.e. from the App Runner VPC connector)."
  value       = aws_db_instance.postgres.endpoint
}

output "rds_address" {
  description = "RDS hostname only (no port)."
  value       = aws_db_instance.postgres.address
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket used for Legal Vault document storage."
  value       = aws_s3_bucket.app.bucket
}

output "custom_domain_dns_target" {
  description = "CNAME target to point domain_name at. Create a CNAME record: domain_name -> this value, at your DNS provider."
  value       = aws_apprunner_custom_domain_association.this.dns_target
}

output "custom_domain_certificate_validation_records" {
  description = <<-EOT
    DNS records App Runner needs added at your DNS provider to validate and
    issue the (App Runner-managed) ACM certificate for domain_name. Each
    entry has name/type/value — add them as CNAME records before expecting
    the custom domain to go ACTIVE. Run `terraform apply` once first to
    populate this (it's only known after the association is created).
  EOT
  value       = aws_apprunner_custom_domain_association.this.certificate_validation_records
}

output "ssm_parameter_path_prefix" {
  description = "SSM parameter path prefix this app's secrets live under (and the only path the App Runner instance role can read)."
  value       = local.ssm_prefix
}

output "waf_web_acl_arn" {
  description = "ARN of the WAF Web ACL protecting the App Runner service."
  value       = aws_wafv2_web_acl.app.arn
}

output "budget_alerts_sns_topic_arn" {
  description = "SNS topic ARN that AWS Budgets publishes to and alert_email is subscribed to."
  value       = aws_sns_topic.budget_alerts.arn
}
