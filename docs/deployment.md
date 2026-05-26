# Deployment Guide

## Next.js Dashboard → Vercel

1. Push code to GitHub (already done)
2. Go to https://vercel.com/new → Import `Rednax3la/userdataplug`
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `EXTRACTOR_SERVICE_URL` (your Railway URL, e.g. `https://userplug-extractor.up.railway.app`)
   - `EXTRACTOR_SERVICE_SECRET`
   - `NEXT_PUBLIC_APP_URL` (your Vercel URL, e.g. `https://userdataplug.vercel.app`)
4. Deploy

## Python Extractor → Railway

1. Go to https://railway.app/new
2. Deploy from GitHub → select `Rednax3la/userdataplug`
3. Set root directory to `extractor`
4. Add environment variables:
   - `SERVICE_SECRET`
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Railway auto-detects `Procfile` and starts the service
6. Copy the Railway URL → paste into Vercel `EXTRACTOR_SERVICE_URL`

## Post-deployment checklist

- [ ] Supabase schema migrated
- [ ] Storage bucket `uploads` created
- [ ] At least one auth user created in Supabase
- [ ] Test upload a small CSV through the dashboard
- [ ] Verify extractor receives the job (Railway logs)
- [ ] Verify contacts appear in the Contacts page
- [ ] Test export as CSV and Meta format

## Scaling

- Extractor can handle ~50 concurrent requests on Railway Hobby ($5/mo)
- For 1000+ file batches, upgrade Railway to Pro or use Railway's background worker mode
- Supabase Free tier supports 500MB DB — upgrade to Pro for production
