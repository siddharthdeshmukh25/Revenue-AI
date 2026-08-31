"""
setup_database.py
-----------------
Automatically creates the Supabase database tables using the Supabase Python client.
Run this once to set up your database without manually using the SQL Editor.
"""

import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ SUPABASE_URL or SUPABASE_KEY missing in .env file")
    exit(1)

print("🔧 Setting up Supabase database tables...")
print(f"📍 Project URL: {SUPABASE_URL}")

try:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # Create tables using Supabase client (this will create them if they don't exist)
    # Note: Supabase doesn't support raw SQL execution via REST API
    # We need to use the SQL Editor in the dashboard or use a different approach
    
    print("⚠️  Supabase REST API doesn't support raw SQL execution.")
    print("📝 Please manually run the SQL in Supabase Dashboard:")
    print("   1. Go to https://supabase.com/dashboard")
    print("   2. Select your project")
    print("   3. Click SQL Editor (left sidebar)")
    print("   4. Click New query")
    print("   5. Copy contents of supabase_schema.sql")
    print("   6. Paste and click Run")
    
except Exception as e:
    print(f"❌ Error: {e}")
