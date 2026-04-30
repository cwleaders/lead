# MyHire by CW Leaders

`myhire.cwleaders.com` is the applicant-only CW Leaders web app. It pairs a polished, indexable landing experience with a modern multi-step application flow and an email-first serverless submission pipeline.

## What is included

- Static applicant-facing routes for `/`, `/apply`, `/faq`, `/privacy`, `/terms`, and `/thank-you`
- SEO, GEO, social metadata, sitemap, robots, manifest, and CW monogram brand assets
- A 4-step application flow with file uploads, client-side validation, and applicant confirmation
- AWS-ready Lambda handler for `POST /api/applications`
- Local development mode that stores submissions and outbound emails under `.local-data/`

## Scripts

- `npm run dev` starts a lightweight local server on `http://localhost:4321`
- `npm run build:lambda` bundles the Lambda handler for deployment
- `npm run render:assets` regenerates PNG favicon and social assets from the SVG sources
- `npm test` runs the built-in Node test suite

## Environment

The app defaults to local delivery mode if AWS configuration is missing.

### Common

- `PUBLIC_SITE_URL` defaults to `https://myhire.cwleaders.com`
- `INTERNAL_NOTIFICATION_EMAIL` defaults to `newapp@cwleaders.com`
- `CONTACT_EMAIL` defaults to `newapp@cwleaders.com`
- `MAX_FILE_BYTES` defaults to `5242880`

### AWS delivery mode

- `DELIVERY_MODE=aws`
- `AWS_REGION`
- `S3_BUCKET`
- `SES_FROM_EMAIL` defaults to `MyHire <no-reply@cwleaders.com>`
- `FILE_URL_TTL_SECONDS` for presigned document links

### Local development mode

- `DELIVERY_MODE=local`
- `LOCAL_DATA_DIR` to override the default `.local-data` folder

## Project layout

- [`public/`](/Users/bassinet/Documents/Playground/CW Leaders/public) static site routes and assets
- [`api/applications.mjs`](/Users/bassinet/Documents/Playground/CW Leaders/api/applications.mjs) Lambda-style application endpoint
- [`src/lib/`](/Users/bassinet/Documents/Playground/CW Leaders/src/lib) multipart parsing, validation, storage, and email utilities
- [`scripts/dev-server.mjs`](/Users/bassinet/Documents/Playground/CW Leaders/scripts/dev-server.mjs) local preview server

## Deployment notes

This repo is structured for static hosting plus a serverless API. The static `public/` directory can be deployed behind CloudFront or Amplify Hosting, while `api/applications.mjs` can be deployed as an AWS Lambda behind API Gateway.
