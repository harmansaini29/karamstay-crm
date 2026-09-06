terraform {
  required_version = ">= 1.7.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state in S3 + DynamoDB lock — uncomment after creating the
  # tfstate bucket and lock table (see infra/runbook.md Step 0).
  # This MUST be configured before sharing Terraform with a team or running
  # from CI/CD, so state is never stored on a local machine.
  #
  # backend "s3" {
  #   bucket         = "karamstay-tfstate-907079642634"
  #   key            = "backend/prod/terraform.tfstate"
  #   region         = "ap-south-1"
  #   dynamodb_table = "karamstay-tflock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.app_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
