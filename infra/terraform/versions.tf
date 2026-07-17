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
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }

  # Uncomment and configure a remote backend before running this against a
  # real AWS account. Local state is fine for a first `plan`, but for any
  # team/CI usage you want state in S3 + a DynamoDB lock table (or Terraform
  # Cloud). This is intentionally left as a template, not wired up, since we
  # don't know the client's preferred backend/account layout yet.
  #
  # backend "s3" {
  #   bucket         = "REPLACE-ME-karamstay-tfstate"
  #   key            = "backend/prod/terraform.tfstate"
  #   region         = "ap-south-1"
  #   dynamodb_table = "REPLACE-ME-karamstay-tflock"
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
