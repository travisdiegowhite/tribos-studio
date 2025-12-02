#!/bin/bash

# Edge Function Deployment Script
# This script helps you deploy the send-invitation-email function

echo "🚀 Supabase Edge Function Deployment"
echo "====================================="
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    if ! command -v ~/.local/bin/supabase &> /dev/null; then
        echo "❌ Supabase CLI not found!"
        echo ""
        echo "Please install it first:"
        echo "  https://github.com/supabase/cli#install-the-cli"
        exit 1
    else
        export PATH="$HOME/.local/bin:$PATH"
    fi
fi

echo "✅ Supabase CLI found: $(supabase --version)"
echo ""

# Check if logged in
if ! supabase projects list &> /dev/null; then
    echo "❌ Not logged in to Supabase"
    echo ""
    echo "Please login first:"
    echo "  supabase login"
    echo ""
    exit 1
fi

echo "✅ Logged in to Supabase"
echo ""

# Set the Resend API key
RESEND_API_KEY="re_EFr7LWEs_J5sjWdB5RxktZga6VckRwm1Y"

echo "📝 Setting Resend API key as secret..."
supabase secrets set RESEND_API_KEY=$RESEND_API_KEY

if [ $? -eq 0 ]; then
    echo "✅ Resend API key set successfully"
else
    echo "⚠️  Warning: Failed to set Resend API key (may already be set)"
fi

echo ""
echo "🚀 Deploying send-invitation-email function..."
echo ""

supabase functions deploy send-invitation-email

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Function deployed successfully!"
    echo ""
    echo "📍 Function URL:"
    echo "   https://toihfeffpljsmgritmuy.supabase.co/functions/v1/send-invitation-email"
    echo ""
    echo "📚 Next steps:"
    echo "   1. Run database migrations (if not done already)"
    echo "   2. Test inviting an athlete from the coach dashboard"
    echo "   3. Check your email for the invitation"
    echo ""
else
    echo ""
    echo "❌ Deployment failed!"
    echo ""
    echo "Troubleshooting:"
    echo "   1. Make sure you're in the project directory"
    echo "   2. Check if you're linked to the right project: supabase projects list"
    echo "   3. Try linking: supabase link --project-ref toihfeffpljsmgritmuy"
    echo ""
    exit 1
fi
