# Security Policy

## Supported versions

Only the latest code on the `main` branch receives security fixes. Older commits, forks and deployments are not supported.

## Reporting a vulnerability

Please **do not** open a public GitHub issue, discussion or pull request for security vulnerabilities.

Instead, report it privately using GitHub's [private vulnerability reporting](https://github.com/khemssharma/StudyNotion/security/advisories/new) (Security tab → Report a vulnerability), or contact the maintainer through their [GitHub profile](https://github.com/khemssharma).

Please include:

- A description of the issue and its potential impact
- Steps to reproduce, or a proof of concept
- Affected component (API, `ui/`, `ml-service/`, `pipeline/`) and commit or version
- Any suggested fix, if you have one

## What to expect

- Acknowledgement of your report within **7 days**
- An initial assessment and next steps within **14 days**
- Credit in the fix or advisory once it is released, unless you prefer to stay anonymous

Please give us reasonable time to fix the issue before disclosing it publicly.

## Scope

In scope: code in this repository, including the Express API, React frontend, ML recommendation service and ETL pipelines.

Out of scope: vulnerabilities in third-party services (MongoDB, Redis, Cloudinary, Razorpay, AI providers) — please report those to the vendor directly. Never test against live payment keys or real user data.
