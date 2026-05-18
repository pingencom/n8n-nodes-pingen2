# Security Policy

## Supported versions

The latest published version on npm receives security patches. Older versions are best-effort.

## Reporting a vulnerability

If you believe you've found a security vulnerability, please **do not open a public issue**.

Email **info@pingen.com** with:

- A description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept welcome)
- The `n8n-nodes-pingen2` version and your n8n version

We aim to acknowledge reports within 3 business days and issue a fix or mitigation within 14 days for high-severity issues.

## What's in scope

- Credential leaks (tokens, client secrets, PDF contents) through logs, error messages, or stack traces
- Authentication / authorisation bypasses
- Injection via user-provided parameters (org IDs, letter IDs, query params)
- Token cache poisoning or cross-credential contamination

## What's out of scope

- Issues with the n8n platform itself — report to the [n8n team](https://github.com/n8n-io/n8n/security)
- Issues with the Pingen API — report via Pingen's security channel
- Denial-of-service through legitimate API usage (rate limits are Pingen's domain)

Thank you for helping keep users safe.
