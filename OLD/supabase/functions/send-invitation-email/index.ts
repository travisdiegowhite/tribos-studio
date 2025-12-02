import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // Parse request body
    const { type, athleteEmail, coachId, invitationToken, relationshipId, coachMessage } = await req.json()

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)

    // Get coach profile
    const { data: coachProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('display_name, avatar_url')
      .eq('id', coachId)
      .single()

    if (profileError) {
      console.error('Error fetching coach profile:', profileError)
    }

    const coachName = coachProfile?.display_name || 'Your Coach'
    const appUrl = 'https://tribos.studio' // Update with your actual domain

    let emailHtml: string
    let emailSubject: string

    if (type === 'new_user') {
      // Email for users who don't have an account yet
      const signupUrl = `${appUrl}/signup?invitation_token=${invitationToken}`

      emailSubject = `${coachName} invited you to join tribos.studio`
      emailHtml = generateNewUserEmail(coachName, athleteEmail, signupUrl, coachMessage)
    } else {
      // Email for existing users
      const dashboardUrl = `${appUrl}/training`

      emailSubject = `${coachName} wants to be your coach on tribos.studio`
      emailHtml = generateExistingUserEmail(coachName, dashboardUrl)
    }

    // Send email via Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'tribos.studio <onboarding@resend.dev>', // Update with your verified domain
        to: [athleteEmail],
        subject: emailSubject,
        html: emailHtml,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('Resend API error:', data)
      throw new Error(data.message || 'Failed to send email')
    }

    return new Response(
      JSON.stringify({ success: true, emailId: data.id }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    )
  } catch (error) {
    console.error('Error in send-invitation-email function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    )
  }
})

/**
 * Generate email for new users (no account yet)
 */
function generateNewUserEmail(
  coachName: string,
  athleteEmail: string,
  signupUrl: string,
  coachMessage: string | null
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Coach Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                🚴 You're Invited!
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 24px; color: #333333;">
                Hi there!
              </p>

              <p style="margin: 0 0 20px; font-size: 16px; line-height: 24px; color: #333333;">
                <strong>${coachName}</strong> has invited you to join <strong>tribos.studio</strong> as their athlete.
              </p>

              ${coachMessage ? `
                <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 16px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; font-size: 14px; line-height: 20px; color: #555555; font-style: italic;">
                    "${coachMessage}"
                  </p>
                  <p style="margin: 8px 0 0; font-size: 12px; color: #888888;">
                    — ${coachName}
                  </p>
                </div>
              ` : ''}

              <div style="background-color: #f8f9fa; padding: 24px; margin: 24px 0; border-radius: 6px;">
                <h3 style="margin: 0 0 12px; font-size: 18px; color: #333333;">
                  What is tribos.studio?
                </h3>
                <p style="margin: 0 0 8px; font-size: 14px; line-height: 20px; color: #555555;">
                  ✨ AI-powered training plans tailored to your goals<br>
                  📊 Performance tracking and analytics<br>
                  🗺️ Intelligent route planning<br>
                  💬 Direct communication with your coach<br>
                  📈 Track your progress and achievements
                </p>
              </div>

              <p style="margin: 24px 0; font-size: 16px; line-height: 24px; color: #333333;">
                Accept this invitation to start your cycling journey with ${coachName}:
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                <tr>
                  <td align="center">
                    <a href="${signupUrl}" style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Create Account & Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0; font-size: 14px; line-height: 20px; color: #888888; text-align: center;">
                Or copy and paste this link into your browser:<br>
                <a href="${signupUrl}" style="color: #667eea; word-break: break-all;">${signupUrl}</a>
              </p>

              <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e5e5;">
                <p style="margin: 0; font-size: 12px; line-height: 18px; color: #888888;">
                  This invitation will expire in <strong>7 days</strong>. If you have any questions, please contact ${coachName} directly.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px; background-color: #f8f9fa; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; color: #888888;">
                © 2025 tribos.studio - Intelligent Cycling Platform
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * Generate email for existing users
 */
function generateExistingUserEmail(
  coachName: string,
  dashboardUrl: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Coach Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                🎯 New Coach Invitation
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 24px; color: #333333;">
                Hi there!
              </p>

              <p style="margin: 0 0 20px; font-size: 16px; line-height: 24px; color: #333333;">
                <strong>${coachName}</strong> wants to be your coach on tribos.studio.
              </p>

              <p style="margin: 0 0 20px; font-size: 16px; line-height: 24px; color: #333333;">
                A new invitation is waiting for you in your dashboard. Review the details and accept to start working together!
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      View Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0; font-size: 14px; line-height: 20px; color: #888888; text-align: center;">
                Or go to: <a href="${dashboardUrl}" style="color: #667eea;">${dashboardUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px; background-color: #f8f9fa; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; color: #888888;">
                © 2025 tribos.studio - Intelligent Cycling Platform
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}
