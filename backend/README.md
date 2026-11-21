# DocMind Cloud

## Run locally

From the `backend` directory:

```bash
cp .env.example .env
npm install
docker compose up -d
npm run build
npm run seed
```

Start the API and the worker in two terminals:

```bash
npm run start:prod
npm run start:worker
```

The API listens on port 4000. Local defaults are `STORAGE_DRIVER=local`, `QUEUE_DRIVER=inmemory`, and `AI_DRIVER=mock`. Postgres is `pgvector/pgvector:pg16` with user, password, and database `docmind`.

Seeded accounts, password `Demo@123`:

- `admin@abc.vn` and `employee@abc.vn` (Công ty ABC)
- `admin@xyz.vn` (Công ty XYZ)

Sample documents are in `samples/`. Do not set AWS access keys. On EC2 the SDK uses the instance role. Set `DB_SECRET_ARN` there instead of `DATABASE_URL`.
