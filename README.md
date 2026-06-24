# [Akhil subenum] v1.0

> A high-performance subdomain enumeration suite combining brute-force DNS resolution and Certificate Transparency (CT) log queries. Features a robust Command Line Interface (CLI) and a stunning, responsive Web GUI with Server-Sent Events (SSE) streaming.

---

## 🚀 Key Features

- **Dual Mode Interface**: Choose between a powerful, automation-ready CLI or a premium, cyberpunk-themed Web GUI.
- **Certificate Transparency Log Queries**: Harvests historical subdomains from the **crt.sh** database using intelligent rate-limit handling and automatic retries.
- **DNS Resolution Engine**: Concurrent resolutions using Node's native `dns.promises` API with configurable timeouts and concurrency limits.
- **Stunning Web Dashboard**:
  - Real-time **Server-Sent Events (SSE)** streaming directly from the scanning process.
  - Cyberpunk-themed design with retro terminal log streaming, neon glows, and a dynamic canvas grid background.
  - Interactive status counters and filterable results table (filter by record type `A`/`CNAME` or discovery source `brute`/`crt.sh`).
  - Report downloading directly from the browser.
- **Serverless Ready**: Out-of-the-box support for **Vercel** serverless functions (`/api/scan` and `/api/results/:domain`), featuring optimized path resolution and graceful fallback to a high-prevalence 2,000-word list.
- **Graceful Termination**: Handles `SIGINT` (Ctrl+C) by saving partial results before exiting.

---

## 📂 Project Structure

```
SUB-DOMAIN-ENUMERATOR/
├── api/
│   ├── scan.js               # Vercel serverless scanning endpoint (SSE)
│   └── results/
│       └── [domain].js       # Vercel serverless report retriever
├── public/
│   ├── index.html            # Web GUI main page
│   ├── app.js                # Web GUI interaction & SSE logic
│   ├── style.css             # Cyberpunk/cybersecurity design system
│   ├── favicon.svg           # Main SVG favicon
│   └── favicon.png           # Fallback PNG favicon
├── src/
│   ├── index.js              # CLI entry point (commander)
│   ├── resolver.js           # DNS lookup with p-limit concurrency
│   ├── crtsh.js              # crt.sh query client with retries
│   └── reporter.js           # Terminal logger and persistence helper
├── wordlists/
│   ├── subdomains.txt        # Comprehensive list (369,790 subdomains)
│   └── top2000.txt           # High-prevalence list (2,000 subdomains)
├── dev-server.js             # Local GUI development server (raw Node http)
├── vercel.json               # Vercel deployment routing & redirects
└── package.json              # Dependencies and start scripts
```

---

## 🛠️ Requirements

- **Node.js ≥ 18** (uses native `fetch`, `dns.promises`, and ES Modules)

---

## 📦 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Akhil-Binu/SUB-DOMAIN-ENUMERATOR.git
   cd SUB-DOMAIN-ENUMERATOR
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Link globally (Optional, CLI only)**:
   ```bash
   npm link
   ```

---

## 🖥️ Running the Web GUI (Local)

To run the web interface locally on your machine:

1. **Launch the development server**:
   ```bash
   npm run gui
   # or
   node dev-server.js
   ```
2. **Access the application**:
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 💻 Running the CLI

### Basic Scan
```bash
node src/index.js -d example.com
```

### Advanced Scan
```bash
node src/index.js -d example.com \
  -w wordlists/subdomains.txt \
  -t 100 \
  --timeout 3000 \
  -o ./output \
  --verbose
```

### Skip crt.sh / Custom Wordlist
```bash
node src/index.js -d example.com --no-crt -w /path/to/custom.txt
```

### If Globally Linked
```bash
subenum -d example.com --verbose
```

### CLI Options

| Flag | Short | Default | Description |
|---|---|---|---|
| `--domain` | `-d` | *(required)* | Target domain |
| `--wordlist` | `-w` | `wordlists/subdomains.txt` | Path to subdomain wordlist |
| `--threads` | `-t` | `50` | Concurrent DNS lookups |
| `--timeout` | | `2000` | DNS lookup timeout (ms) |
| `--output` | `-o` | `./output` | JSON report output directory |
| `--no-crt` | | *(false)* | Disable crt.sh Certificate Transparency search |
| `--verbose` | | *(false)* | Include failed/unresolvable results in console |

---

## 📝 Wordlists Comparison

- **`wordlists/subdomains.txt`**: A massive list containing **369,790 subdomains** for comprehensive local testing. *This file is ignored by Git to keep repo sizes optimal.*
- **`wordlists/top2000.txt`**: A compact, high-prevalence wordlist containing exactly **2,000 subdomains** sourced from SecLists' top 1 million subdomains database. It is shipped in Git and automatically utilized by the Vercel serverless environment to guarantee fast scan times and remain within serverless timeout constraints.

---

## ☁️ Vercel Deployment

This project is fully ready to be deployed to **Vercel** as a Serverless Application:

1. Install the Vercel CLI:
   ```bash
   npm install -g vercel
   ```
2. Deploy directly:
   ```bash
   vercel --prod
   ```

The app will dynamically redirect `/favicon.ico` to the modern `/favicon.svg`, serve the frontend statically, and map API scans to the stateless serverless function `/api/scan` using Server-Sent Events.

---

## 📄 License

This project is licensed under the MIT License.
