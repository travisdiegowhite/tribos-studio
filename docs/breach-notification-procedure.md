# Breach Notification Procedure — tribos.studio

Last updated: February 2026

## 1. Purpose

This document outlines the procedure for identifying, containing, and reporting data breaches affecting tribos.studio, in compliance with the Garmin Connect Developer Program Agreement (Section 5.1f–h), GDPR Article 33/34, and general best practices.

## 2. Definition of a Breach

A data breach is any unauthorized access, acquisition, use, or disclosure of user data, including but not limited to:

- Unauthorized access to the Supabase database or user_profiles table
- Compromise of OAuth tokens (Strava, Garmin, Wahoo, Google)
- Unauthorized access to Garmin Connect data obtained through the API
- Exposure of API keys, service role keys, or webhook secrets
- Unauthorized access to AI conversation history or training data

## 3. Detection

Breaches may be detected through:

- **Sentry alerts**: Unusual error patterns or unauthorized access attempts
- **Supabase audit logs**: Unexpected database access patterns
- **Vercel logs**: Anomalous API request patterns
- **User reports**: Users reporting unauthorized activity on their accounts
- **Dependency advisories**: Security vulnerabilities in third-party packages

## 4. Immediate Response (0–4 hours)

Upon detection or reasonable suspicion of a breach:

1. **Contain**: Immediately revoke compromised credentials, rotate API keys, and disable affected endpoints
2. **Assess scope**: Determine what data was accessed, how many users are affected, and whether the breach is ongoing
3. **Preserve evidence**: Capture relevant logs, error reports, and system state before remediation
4. **Assemble response team**: Notify the project owner (travis@tribos.studio)

## 5. Notification Timeline

### 5.1 Garmin Notification (within 24 hours)

Per the Garmin Connect Developer Program Agreement, Garmin must be notified within **24 hours** of discovering a breach that involves Garmin Connect data.

**Contact**: Garmin Developer Relations
- Email: developer.relations@garmin.com
- Subject: "[URGENT] Data Breach Notification — tribos.studio"

**Notification must include**:
- Date and time breach was discovered
- Description of the breach
- Types of Garmin data potentially affected
- Number of users potentially affected
- Steps taken to contain the breach
- Planned remediation actions
- Point of contact for follow-up

### 5.2 User Notification (within 72 hours)

Affected users must be notified within **72 hours** (GDPR Article 34 timeline) via:

- **Email** (via Resend transactional email): Description of the breach, data affected, steps users should take
- **In-app notification**: Alert banner on the dashboard
- **Password reset**: Force password reset if credentials may be compromised

### 5.3 Regulatory Notification (within 72 hours)

If the breach affects EU residents' personal data and is likely to result in a risk to their rights:

- Notify the relevant supervisory authority within 72 hours (GDPR Article 33)
- Document the breach in an internal register

## 6. Remediation

After containment:

1. **Root cause analysis**: Document how the breach occurred
2. **Patch**: Fix the vulnerability that allowed the breach
3. **Token rotation**: Rotate all potentially compromised secrets and API keys
4. **OAuth re-authorization**: If third-party tokens were compromised, revoke and require users to re-authorize
5. **Security review**: Audit related systems for similar vulnerabilities

## 7. Post-Incident

- **Incident report**: Write a detailed post-mortem within 7 days
- **Follow-up with Garmin**: Provide remediation details and updated security measures
- **Update security documentation**: Revise security-posture.md with lessons learned
- **User communication**: Send follow-up notification when remediation is complete

## 8. Contact Information

| Role | Contact |
|------|---------|
| Project Owner | travis@tribos.studio |
| Garmin Developer Relations | developer.relations@garmin.com |
| Supabase Support | support@supabase.io |
| Sentry Alerts | Configured in src/lib/sentry.js |

## 9. Review Schedule

This procedure should be reviewed and updated:

- After any security incident
- When adding new third-party integrations
- At minimum every 6 months
