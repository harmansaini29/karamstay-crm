#!/usr/bin/env python3
"""
KaramStay Bank Accounts Operator Control CLI & Diagnostic Tool.

This executable script provides a direct command-line interface for the business
owner / operator to manage bank accounts, pause/resume collection services, and
verify webhook credentials.

Usage:
    python manage_bank_accounts.py --list
    python manage_bank_accounts.py --status
    python manage_bank_accounts.py --pause hdfc_1
    python manage_bank_accounts.py --resume hdfc_1
    python manage_bank_accounts.py --pause-all
    python manage_bank_accounts.py --resume-all
"""

import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.bank_accounts import cli_main  # noqa: E402

if __name__ == "__main__":
    cli_main()
