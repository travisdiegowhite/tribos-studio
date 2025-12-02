#!/bin/bash

# Coach Platform Migration Runner
# This script runs the 001_coach_platform.sql migration against your Supabase database

echo "=========================================="
echo "Coach Platform Database Migration"
echo "=========================================="
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

SUPABASE_URL="${REACT_APP_SUPABASE_URL}"
SUPABASE_PROJECT_REF=$(echo $SUPABASE_URL | sed -E 's/https:\/\/([^.]+).*/\1/')

echo "Supabase Project: $SUPABASE_PROJECT_REF"
echo "Migration File: database/migrations/001_coach_platform.sql"
echo ""

# Check if Supabase CLI is installed
if command -v supabase &> /dev/null; then
    echo "Using Supabase CLI..."
    echo ""
    echo "To run this migration, execute:"
    echo "  supabase db push"
    echo ""
    echo "Or manually in Supabase Dashboard SQL Editor:"
    echo "  1. Go to https://supabase.com/dashboard/project/$SUPABASE_PROJECT_REF/sql"
    echo "  2. Copy the contents of database/migrations/001_coach_platform.sql"
    echo "  3. Paste and run"
else
    echo "Supabase CLI not found."
    echo ""
    echo "To run this migration manually:"
    echo "  1. Go to: https://supabase.com/dashboard/project/$SUPABASE_PROJECT_REF/sql"
    echo "  2. Open the SQL Editor"
    echo "  3. Copy the contents of: database/migrations/001_coach_platform.sql"
    echo "  4. Paste and execute"
    echo ""
    echo "Or install Supabase CLI:"
    echo "  npm install -g supabase"
fi

echo ""
echo "=========================================="
