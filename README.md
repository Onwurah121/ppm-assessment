# PPM — API Key Management Service

A NestJS-based API Key Management service with JWT authentication, MongoDB persistence, and migrate-mongo database migrations.

---

## Table of Contents

- [Requirements](#requirements)
- [Environment Configuration](#environment-configuration)
- [Installation](#installation)
- [Running the App](#running-the-app)
- [Database Migrations](#database-migrations)
- [Running Tests](#running-tests)
- [API Documentation](#api-documentation)
- [Technical Notes](#technical-notes)

---

## API Documentation

The full API reference is published on Postman:

**[📖 Peppermint-API — Postman Docs](https://documenter.getpostman.com/view/37021599/2sBXcGEfLz)**

The collection covers all available endpoints including authentication, API key generation, listing, revocation, and rotation, with example requests and responses.

---

## Requirements

- **Node.js** v18+
- **npm** v9+
- **MongoDB** (local instance or remote URI, e.g. MongoDB Atlas)

---

## Environment Configuration

Create a `.env` file in the project root. The following variables are required:

```env
# MongoDB connection string
MONGODB_URI=mongodb://localhost:27017/ppm

# JWT
JWT_SECRET=your-very-strong-secret-key
JWT_EXPIRES_IN=7d

# App
PORT=3000
```

> **Note:** Never commit your `.env` file. Add it to `.gitignore`.

---

## Installation

```bash
npm install
```

---

## Running the App

```bash
# Development
npm run start

# Watch mode (auto-restarts on file changes)
npm run start:dev

# Production mode (requires a build first)
npm run build
npm run start:prod
```

The server will start on `http://localhost:3000` (or the `PORT` value in your `.env`).

---

## Database Migrations

This project uses [migrate-mongo](https://github.com/seppevs/migrate-mongo) to manage MongoDB schema changes and seed data.

### Configuration

Migrations are configured in `migrate-mongo-config.js`, which reads `MONGODB_URI` from your `.env` file automatically:

```js
// migrate-mongo-config.js
require('dotenv').config();

const config = {
  mongodb: {
    url: process.env.MONGODB_URI || 'mongodb://localhost:27017/ppm',
    options: {},
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.js',
  moduleSystem: 'commonjs',
};
```

Migration history is tracked in a `changelog` collection inside MongoDB.

### Commands

```bash
# Check the status of all migrations
npm run migrate:status

# Apply all pending migrations
npm run migrate:up

# Roll back the last applied migration
npm run migrate:down
```

### Creating a New Migration

```bash
npx migrate-mongo create <migration-name>
```

This generates a new file in the `migrations/` folder with `up()` and `down()` functions for you to fill in.

---

## Running Tests

```bash
# Unit tests
npm run test

# Unit tests in watch mode
npm run test:watch

# Test coverage report
npm run test:cov

# End-to-end tests
npm run test:e2e
```

---

## Technical Notes

### DNS Resolver (`main.ts` & `migrate-mongo-config.js`)

Both the application entry point (`src/main.ts`) and the migration config (`migrate-mongo-config.js`) explicitly set the DNS resolver to **Cloudflare's 1.1.1.1**:

```ts
import * as dns from 'node:dns';

dns.setServers(['1.1.1.1']);
```

**Why?**

Some server environments (particularly Ubuntu EC2 instances) default to using `127.0.0.53` — the local `systemd-resolved` stub. This can cause intermittent DNS resolution failures when connecting to external services such as **MongoDB Atlas**, because `systemd-resolved` may not correctly forward queries in all network configurations.

By explicitly pointing to `1.1.1.1`, we bypass the local resolver and ensure reliable, consistent DNS resolution in all environments — both locally and in production.

> **Scope:** `dns.setServers()` only affects `dns.resolve*()` calls. It does **not** affect `dns.lookup()`, which is used by lower-level OS networking. For most MongoDB Atlas connections (which go through Node.js's internal resolver), this is sufficient.

### MongoDB Connection

The MongoDB connection URI is loaded from `MONGODB_URI` in the environment. It is used in two places:

1. **App runtime** — via `@nestjs/mongoose` in `AppModule`:
   ```ts
   MongooseModule.forRoot(process.env.MONGODB_URI)
   ```

2. **Migrations** — via `migrate-mongo-config.js`:
   ```js
   url: process.env.MONGODB_URI || 'mongodb://localhost:27017/ppm'
   ```

Both read from the same environment variable, so setting `MONGODB_URI` once in `.env` is sufficient to configure the entire application.
