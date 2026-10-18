# ⚡ Cloudflare Worker Proxy (Zero-Config Setup)

This free serverless proxy lets **anyone** use your Auto MCQ Solver extension with **zero API keys** and zero configuration!

---

## 🚀 2-Minute Setup via Cloudflare Web Dashboard (Easiest Method)

You do not need to install any command-line tools.

### Step 1: Create a Free Cloudflare Account
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/sign-up) and create a free account.
2. In the left sidebar, click **Compute (Workers & Pages)** → **Workers**.
3. Click **Create Application** → **Create Worker**.
4. Give it a name (e.g. `auto-mcq-solver`) and click **Deploy**.

### Step 2: Paste the Worker Code
1. On your newly created worker page, click **Edit code** (in the top right).
2. Delete everything in the code editor, and copy & paste the contents of [`worker.js`](worker.js).
3. Click **Save and Deploy**.

### Step 3: Add Your Gemini API Key Secret
1. Go back to your Worker's main page.
2. Click the **Settings** tab → **Variables and Secrets**.
3. Under **Secrets**, click **Add secret**:
   - **Variable name**: `GEMINI_API_KEY`
   - **Value**: *(Paste your free Gemini API key from Google AI Studio)*
4. Click **Deploy**.

### Step 4: Copy Your Worker URL
- At the top of the page, copy your public worker URL:
  `https://auto-mcq-solver.<your-subdomain>.workers.dev`
- Put this URL into `background/background.js` (or in the extension popup)!

---

## 💻 Optional: Setup via Terminal (Wrangler CLI)

If you have Node.js / npm installed:

```bash
cd server
npx wrangler login
npx wrangler deploy
npx wrangler secret put GEMINI_API_KEY
```
*(Enter your Gemini API key when prompted).*
