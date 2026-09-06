# KaramStay — Production Launch Runbook (AWS ap-south-1 Mumbai)
# Account: 907079642634 | Credits: 140 USD active (expires Apr 27 2027)
# Last updated: September 2026

---

## Quick Credit Tip — Earn 60 USD More Before You Start

In your AWS Console -> Explore AWS widget, complete these 3 remaining tasks
to unlock the full 200 USD credit balance:

  [20 USD] Create an Aurora or RDS database  ← Auto-earned in Step 3 below!
  [20 USD] Launch an instance using EC2       ← Launch + immediately terminate any Free-Tier instance
  [20 USD] Create a web app using AWS Lambda  ← Use the AWS Lambda getting-started template wizard

---

## Prerequisites

Install these tools on your local machine before starting:

  Terraform >= 1.7:
    winget install Hashicorp.Terraform

  AWS CLI >= 2:
    winget install Amazon.AWSCLI

  Docker Desktop (already installed):
    Already confirmed on your machine

  Configure AWS CLI with your IAM admin credentials:
    aws configure
    # AWS Access Key ID: (your IAM user access key)
    # AWS Secret Access Key: (your IAM user secret key)
    # Default region name: ap-south-1
    # Default output format: json

  Verify identity:
    aws sts get-caller-identity
    # Should show Account: "907079642634"

---

## Step 0 — (One-time) Create Terraform State Bucket

Terraform state must be stored remotely before any team/CI usage.

  aws s3 mb s3://karamstay-tfstate-907079642634 --region ap-south-1

  aws s3api put-bucket-versioning 
    --bucket karamstay-tfstate-907079642634 
    --versioning-configuration Status=Enabled

  aws s3api put-bucket-encryption 
    --bucket karamstay-tfstate-907079642634 
    --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

  aws s3api put-public-access-block 
    --bucket karamstay-tfstate-907079642634 
    --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

  aws dynamodb create-table 
    --table-name karamstay-tflock 
    --attribute-definitions AttributeName=LockID,AttributeType=S 
    --key-schema AttributeName=LockID,KeyType=HASH 
    --billing-mode PAY_PER_REQUEST 
    --region ap-south-1

Then uncomment the backend "s3" block in infra/terraform/versions.tf and
fill in the bucket name and table name above.

---

## Step 1 — Prepare Variables

  cd e:\KaramStay\infra\terraform

  Copy-Item environments\prod.tfvars.example environments\prod.tfvars

Open prod.tfvars and fill in:
  - domain_name      = "api.karamstay.com" (or your actual API domain)
  - alert_email      = "your-real-email@gmail.com"
  - backend_cors_origins = "[\"https://app.karamstay.com\"]"

---

## Step 2 — Bootstrap ECR (Create Registry First)

App Runner is deprecated. ECS Fargate needs the ECR registry to exist before
Terraform can create the ECS service. Bootstrap ECR and IAM OIDC in one targeted apply:

  cd e:\KaramStay\infra\terraform

  terraform init

  terraform apply 
    -target=aws_ecr_repository.app 
    -target=aws_iam_openid_connect_provider.github 
    -target=aws_iam_role.github_actions 
    -target=aws_iam_policy.github_actions 
    -target=aws_iam_role_policy_attachment.github_actions 
    -var-file=environments/prod.tfvars

Note the ECR URL from the output:
  terraform output ecr_repository_url

---

## Step 3 — Build and Push Bootstrap Docker Image

Replace <ACCOUNT_ID> with 907079642634:

  aws ecr get-login-password --region ap-south-1 | 
    docker login --username AWS --password-stdin 
    907079642634.dkr.ecr.ap-south-1.amazonaws.com

  docker build 
    -f e:\KaramStay\apps\backend\Dockerfile 
    -t 907079642634.dkr.ecr.ap-south-1.amazonaws.com/karamstay-prod-backend:latest 
    e:\KaramStay\apps\backend

  docker push 907079642634.dkr.ecr.ap-south-1.amazonaws.com/karamstay-prod-backend:latest

  This will also earn you the "Create an Aurora or RDS database" 20 USD credit
  automatically once Terraform provisions RDS in the next step.

---

## Step 4 — Deploy All Infrastructure

  terraform apply -var-file=environments/prod.tfvars

This provisions:
  VPC with public (ALB + ECS) and private (RDS) subnets — zero NAT Gateway fees
  Application Load Balancer with HTTPS listener and ACM certificate
  ECS Fargate Cluster + Task Definition + Service (0.25 vCPU / 0.5 GB)
  RDS PostgreSQL db.t4g.micro 20 GB gp3 (Free Tier eligible)
  S3 bucket (private, lifecycle rules, gateway VPC endpoint)
  SSM Parameter Store secrets (DB URL, JWT, external placeholders)
  IAM roles (ECS execution, ECS task, GitHub Actions OIDC)
  AWS Budgets alerts at 25 / 50 / 75 / 100 USD
  CloudWatch log group (30-day retention)

Save the outputs — you will need them in Step 6:
  terraform output -json > terraform_outputs.json

---

## Step 5 — Configure DNS for Your Domain

After Step 4 completes, point your domain to the ALB:

  a) Add a CNAME record at your DNS provider:
       api.karamstay.com -> (value of terraform output alb_dns_name)

  b) Add ACM certificate validation CNAMEs:
       terraform output acm_certificate_validation_options
       Add each name/value pair as CNAME records at your DNS provider.
       Wait 5-15 minutes for validation to complete.

---

## Step 6 — Insert Real Third-Party Secrets Into SSM

The WhatsApp and Firebase secrets were seeded with REPLACE_ME placeholders.
Insert real values now (never stored in code or Terraform):

  # WhatsApp Cloud API (from Meta Developer Console)
  aws ssm put-parameter 
    --name "/karamstay/prod/whatsapp_cloud_api_token" 
    --type "SecureString" 
    --value "YOUR_REAL_META_TOKEN" 
    --overwrite 
    --region ap-south-1

  aws ssm put-parameter 
    --name "/karamstay/prod/whatsapp_phone_number_id" 
    --type "SecureString" 
    --value "YOUR_REAL_PHONE_NUMBER_ID" 
    --overwrite 
    --region ap-south-1

  # Firebase (paste the full JSON content of your service account key file)
  aws ssm put-parameter 
    --name "/karamstay/prod/firebase_service_account_json" 
    --type "SecureString" 
    --value (Get-Content "path\to\firebase-service-account.json" -Raw) 
    --overwrite 
    --region ap-south-1

After inserting secrets, force a new ECS task deployment to pick them up:
  aws ecs update-service 
    --cluster karamstay-prod 
    --service karamstay-prod-service 
    --force-new-deployment 
    --region ap-south-1

---

## Step 7 — Run Initial Database Migration

The ECS task starts your FastAPI container but does NOT run Alembic migrations
automatically. Run this once to create all tables:

Option A — Via a one-off ECS task (recommended for production):
  aws ecs run-task 
    --cluster karamstay-prod 
    --task-definition karamstay-prod 
    --launch-type FARGATE 
    --network-configuration "awsvpcConfiguration={subnets=[subnet-XXXXX],securityGroups=[sg-XXXXX],assignPublicIp=ENABLED}" 
    --overrides '{"containerOverrides":[{"name":"api","command":["alembic","upgrade","head"]}]}' 
    --region ap-south-1

  (Replace subnet-XXXXX and sg-XXXXX with actual IDs from terraform output)

Option B — Temporarily from a local machine with DATABASE_URL set:
   = "postgresql+psycopg://karamstay:PASSWORD@RDS_HOST:5432/karamstay"
  cd e:\KaramStay\apps\backend
  alembic upgrade head

---

## Step 8 — Configure GitHub Actions Repository Variables

In GitHub (https://github.com/DevKano98/KaramStay):
  Settings -> Secrets and variables -> Actions -> Variables tab

Add these 5 variables (all values come from 	erraform output):

  AWS_REGION              ap-south-1
  AWS_OIDC_ROLE_ARN       (terraform output github_actions_role_arn)
  ECR_REPOSITORY_URL      (terraform output ecr_repository_url)
  ECS_CLUSTER_NAME        (terraform output ecs_cluster_name)
  ECS_SERVICE_NAME        (terraform output ecs_service_name)

Then in: Settings -> Environments -> New Environment
  Name: production
  Configure required reviewers (yourself) for deployment gate.

---

## Step 9 — Run Live Integration Smoke Test

Verify WhatsApp, Firebase, and S3 all work end-to-end (run from local machine
with real credentials in .env, or against production ECS):

  cd e:\KaramStay\apps\backend
  python scripts\verify_live_integrations.py 
    --whatsapp-to +91XXXXXXXXXX 
    --fcm-token <a-real-device-fcm-token>

Expected output:
  [WhatsApp] OK — sent to +91XXXXXXXXXX: ...
  [Firebase]  OK — pushed to device: ...
  [S3]        OK — uploaded, presigned a download URL, and cleaned up.

---

## Step 10 — Test First CI/CD Deployment

Push any change to main:
  git add .
  git commit -m "chore: trigger first production deployment"
  git push origin main

Monitor on GitHub: Actions tab -> Backend CI/CD workflow
  Stage 1 Test         — lint + pytest against PostgreSQL container
  Stage 2 Build & Push — Docker build + ECR push (tagged with git SHA)
  Stage 3 Deploy       — waits for your approval in the production Environment gate,
                         then deploys to ECS and waits for stability

---

## Monthly Cost Reference (After All Credits Expire, ap-south-1 Mumbai)

  RDS db.t4g.micro (20 GB gp3)          ~14 USD  (~1,170 INR)
  ECS Fargate 0.25vCPU/0.5GB 24x7       ~ 9 USD  (~  750 INR)
  Application Load Balancer              ~ 5 USD  (~  420 INR)
  S3 (10-25 GB storage + requests)       ~ 0.50 USD(~   42 INR)
  ECR (docker images)                    ~ 0.10 USD(~    8 INR)
  CloudWatch Logs                        ~ 0.25 USD(~   21 INR)
  SSM Parameter Store                      0.00 USD — permanently free
  VPC, Subnets, Security Groups            0.00 USD — no NAT Gateway
  WAF (disabled by default)               0.00 USD — using slowapi in-app
  ─────────────────────────────────────────────────────────────────────
  TOTAL                                  ~29 USD/mo (~2,400 INR + 18% GST)

  With 200 USD credits: FREE through approximately Feb-Apr 2027
  After credits: ~2,400 INR/month base (well under your 3,000 INR target)

---

## Rollback Procedure

If a deployment fails or causes issues:
  1. Identify the last good image tag (git SHA) from ECR
  2. In the ECS Console: karamstay-prod cluster -> karamstay-prod-service
     -> Update service -> Revision: choose previous task definition revision
  3. Or via CLI:
       aws ecs update-service 
         --cluster karamstay-prod 
         --service karamstay-prod-service 
         --task-definition karamstay-prod:<PREVIOUS_REVISION> 
         --region ap-south-1

---

## Scaling Up (When You Outgrow 100-200 DAU)

  ECS CPU/Memory: Change ecs_cpu = "512" ecs_memory = "1024" in prod.tfvars,
                  run terraform apply. Zero downtime.

  ECS Tasks:      Change ecs_desired_count = 2 in prod.tfvars.
                  ECS places tasks in both AZs automatically.

  RDS Database:   Change db_instance_class = "db.t4g.small" in prod.tfvars.
                  AWS performs in-place upgrade with ~2 min downtime during maintenance window.

  WAF:            Set enable_waf = true in prod.tfvars when DDoS protection is needed.
