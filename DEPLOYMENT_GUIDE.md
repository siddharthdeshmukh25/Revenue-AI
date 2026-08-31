# Railway Deployment Guide for Revenue AI Backend

## Prerequisites
- Railway account (https://railway.app)
- GitHub account
- Supabase project with database setup
- OpenRouter API key

## Step 1: Push Backend to GitHub

1. Initialize git in backend folder (if not already):
```bash
cd backend
git init
git add .
git commit -m "Initial commit"
```

2. Create a new repository on GitHub
3. Push to GitHub:
```bash
git remote add origin https://github.com/YOUR_USERNAME/ai-revenue-recovery-backend.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy to Railway

1. Go to https://railway.app and login
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your `ai-revenue-recovery-backend` repository
4. Railway will automatically detect it's a Python project
5. Click "Deploy"

## Step 3: Add Environment Variables

After deployment starts, add these environment variables in Railway:

1. Go to your project in Railway
2. Click on the backend service
3. Go to "Variables" tab
4. Add these variables:

```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=your-supabase-service-role-key
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct
MAX_INTERVENTION_ATTEMPTS=2
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
```

## Step 4: Get Railway Backend URL

1. After deployment completes, Railway will give you a URL like:
   `https://your-backend-name.up.railway.app`
2. Copy this URL - this is your `BACKEND_URL`

## Step 5: Update Frontend

In your Next.js frontend, update the `BACKEND_URL`:

1. Go to Vercel (or where frontend is deployed)
2. Add environment variable:
   ```
   BACKEND_URL=https://your-backend-name.up.railway.app
   ```
3. Redeploy frontend

## Step 6: Test

1. Open your frontend URL
2. Try the "Test Payment" form
3. Check if it connects to Railway backend
4. Verify data is saved to Supabase

## Railway Pricing

- Free tier: $5/month credit (enough for development)
- Hobby tier: $5/month (for production)
- Includes: 512MB RAM, 0.5 vCPU, 10GB disk

## Troubleshooting

**Build fails:**
- Check `requirements.txt` has all dependencies
- Verify Python version compatibility

**API not responding:**
- Check Railway logs
- Verify environment variables are set correctly
- Ensure port is set to `$PORT` (Railway provides this)

**Database connection error:**
- Verify SUPABASE_URL and SUPABASE_KEY
- Check Supabase project is active
