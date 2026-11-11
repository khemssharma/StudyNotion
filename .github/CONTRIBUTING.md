# Contributing to StudyNotion

Thanks for your interest in improving **StudyNotion**, an EdTech platform with a deep-learning (NCF) recommendation system, ETL data pipelines and GenAI-powered queries. Bug reports, fixes, docs and new features are all welcome.

**Stack:** Node.js · Express · MongoDB · Redis · React · Python (ML service) · Jest

## Ways to contribute

- 🐛 **Report a bug:** [open a bug report](https://github.com/khemssharma/StudyNotion/issues/new?template=bug_report.yml)
- 💡 **Suggest a feature:** [open a feature request](https://github.com/khemssharma/StudyNotion/issues/new?template=feature_request.yml)
- 📝 **Improve the docs:** typos, unclear steps and missing examples all count
- 🔧 **Fix an issue:** look for issues labelled `good first issue` or `help wanted`

For anything bigger than a small fix, please **open an issue first**, so we can agree on the approach before you spend time on it.

## Local setup

```bash
git clone https://github.com/<your-username>/StudyNotion.git
cd StudyNotion
npm install
# create a .env file with the values used in config/ (database, Redis, Cloudinary, Razorpay, mail, AI keys)
npm run dev                 # start the API server
```

Start the frontend in a second terminal:

```bash
cd ui
npm install
npm start
```

To work on the ML recommendation service:

```bash
cd ml-service
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Project layout

| Path | What lives there |
| --- | --- |
| `routes/`, `controllers/`, `services/`, `models/` | Express API |
| `config/` | Database, Redis, Cloudinary, Razorpay setup |
| `ui/` | React frontend |
| `ml-service/` | Python NCF recommendation model |
| `pipeline/` | ETL data pipelines |
| `__tests__/` | API tests |
| `load-tests/` | Load testing scripts |

## Making a change

1. **Fork** the repo and create a branch from `main`:
   ```bash
   git checkout -b feat/short-description   # or fix/…, docs/…, refactor/…
   ```
2. Make your change. Keep each PR focused on **one** thing.
3. Run the checks below.
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add rematch button
   fix: handle disconnect during game
   docs: clarify .env setup
   ```
5. Push to your fork and open a pull request against `main`. Fill in the PR template.

## Checks before you open a PR

```bash
npm test                    # Jest + Supertest API tests (__tests__/)
(cd ui && npm run build)      # frontend must build
```

### Continuous integration

GitHub Actions run the API tests, load tests, ETL pipeline and model retraining. The `API-tests.yml` check must pass before merge.

## Project-specific guidelines

- **New API endpoints:** add a test in `__tests__/` covering the success case and at least one error case.
- **ML changes:** describe how you validated the model (metrics before vs after) in the PR.
- **Payments (Razorpay):** use test-mode keys only, never live keys.
- **Never commit** `.env`, API keys, dataset dumps or trained model files over a few MB.

## Code style

- Match the style of the code around your change.
- Use clear, descriptive names; avoid unexplained abbreviations.
- Remove debug logs and commented-out code before committing.
- Update the README if your change affects setup or usage.

## Reporting security issues

Please **don't open a public issue** for security vulnerabilities. Contact the maintainer privately through the [GitHub profile](https://github.com/khemssharma) with the details and steps to reproduce.

## Code of conduct

Be respectful and constructive. Harassment, personal attacks and spam aren't tolerated.

## License

This repository doesn't have an open-source license yet. Until one is added, by submitting a contribution you agree that it may be used, modified and distributed as part of this project.
