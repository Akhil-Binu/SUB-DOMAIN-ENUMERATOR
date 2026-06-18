# subenum

> CLI subdomain enumeration tool — DNS brute-force + Certificate Transparency log queries

## Requirements

- **Node.js ≥ 18** (uses native `fetch`, `dns.promises`, `fs/promises`)

## Installation

```bash
npm install
# Optional: link globally
npm link
```

## Usage

```bash
# Basic scan
node src/index.js -d example.com

# Full options
node src/index.js -d example.com \
  -w wordlists/subdomains.txt \
  -t 100 \
  --timeout 3000 \
  -o ./output \
  --verbose

# Skip crt.sh, custom wordlist
node src/index.js -d example.com --no-crt -w /path/to/custom.txt

# If installed globally via npm link
subenum -d example.com --verbose
```

## Options

| Flag | Short | Default | Description |
|---|---|---|---|
| `--domain` | `-d` | *(required)* | Target domain |
| `--wordlist` | `-w` | `wordlists/subdomains.txt` | Wordlist path |
| `--threads` | `-t` | `50` | Concurrent DNS lookups |
| `--timeout` | | `2000` | DNS timeout (ms) |
| `--output` | `-o` | `./output` | JSON report directory |
| `--no-crt` | | off | Skip crt.sh lookup |
| `--verbose` | | off | Show unresolvable entries |

## Output

Terminal output is color-coded:
- 🟢 **Green** `[+]` — A record resolved (IP found)
- 🟡 **Yellow** `[+]` — CNAME resolved (alias)
- 🔴 **Red** `[-]` — Unresolvable (only shown with `--verbose`)

JSON report is saved to `output/{domain}_results.json`:

```json
{
  "meta": {
    "domain": "example.com",
    "generatedAt": "2024-01-01T00:00:00.000Z",
    "totalCandidates": 523,
    "liveCount": 21,
    "aRecords": 18,
    "cnameRecords": 3,
    "unresolvable": 502
  },
  "results": [
    {
      "subdomain": "api.example.com",
      "addresses": ["93.184.216.34"],
      "type": "A",
      "source": "bruteforce",
      "timestamp": "2024-01-01T00:00:01.234Z"
    }
  ]
}
```

## Project Structure

```
subenum/
├── src/
│   ├── index.js      # CLI entry point (commander)
│   ├── resolver.js   # DNS brute-force with p-limit concurrency
│   ├── crtsh.js      # crt.sh CT log queries
│   └── reporter.js   # chalk terminal output + JSON persistence
├── wordlists/
│   └── subdomains.txt
├── output/           # Auto-created on first run
└── package.json
```

## Graceful Exit

Press `Ctrl+C` at any time — partial results collected so far are automatically saved to the output file before exit.
