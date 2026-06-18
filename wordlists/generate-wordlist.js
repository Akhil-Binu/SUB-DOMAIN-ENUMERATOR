/**
 * generate-wordlist.js
 * Generates 100,000+ unique subdomain prefixes via systematic permutations
 * and merges them with the existing wordlist.
 * Run: node generate-wordlist.js
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORDLIST_PATH = path.join(__dirname, 'subdomains.txt');
const OUT_PATH      = path.join(__dirname, 'subdomains.txt');

// ─────────────────────────────────────────────────────────────────────────────
// BASE WORD POOLS
// ─────────────────────────────────────────────────────────────────────────────

const WEB = [
  'www','web','site','home','main','origin','portal','dashboard','panel',
  'console','control','admin','manage','management','server','node','host',
  'app','apps','application','frontend','ui','ux','client','static','public',
  'assets','media','images','cdn','dist','build','deploy',
];

const API = [
  'api','rest','graphql','grpc','rpc','soap','gateway','edge','proxy',
  'backend','service','svc','microservice','endpoint','handler','processor',
  'integration','middleware','relay','dispatcher','broker','forwarder',
  'webhook','callback','router','lb','balancer','upstream',
];

const AUTH = [
  'auth','login','logout','sso','oauth','saml','oidc','identity','idp','idm',
  'account','accounts','signup','register','verify','verification','password',
  'reset','mfa','2fa','totp','otp','token','session','credentials','passkey',
  'rbac','abac','permissions','roles','claims',
];

const MAIL = [
  'mail','smtp','pop3','imap','email','webmail','mx','exchange','owa',
  'mailserver','autoconfig','autodiscover','newsletter','mailer','mta',
  'relay','mailin','mailout','noreply','bounce','spam','dkim','dmarc',
];

const DEV_OPS = [
  'jenkins','ci','cd','cicd','build','deploy','devops','drone','travis',
  'circleci','teamcity','bamboo','argocd','argo','flux','spinnaker',
  'concourse','tekton','pipeline','helm','terraform','ansible','puppet',
  'chef','packer','vagrant','ops','sre','infra','platform','release',
  'artifact','artifactory','nexus','registry','harbor','packages','charts',
];

const SOURCE = [
  'git','gitlab','github','gitea','bitbucket','gogs','svn','repo','repos',
  'code','source','vcs','scm','gerrit','review','mirror','diff','patch',
];

const MONITORING = [
  'grafana','kibana','splunk','elk','prometheus','alertmanager','jaeger',
  'zipkin','tempo','loki','cortex','thanos','mimir','datadog','newrelic',
  'dynatrace','sentry','uptime','status','health','ping','monitor',
  'monitoring','metrics','stats','trace','apm','otel','netdata','zabbix',
  'nagios','icinga','wazuh','insight','reporting','perf','availability','sla',
];

const DATABASE = [
  'db','database','mysql','postgres','postgresql','mariadb','mongodb','mongo',
  'redis','memcached','cassandra','couchdb','couchbase','neo4j','influxdb',
  'clickhouse','druid','tidb','cockroachdb','mssql','sqlserver','oracle',
  'data','datastore','warehouse','datalake','lake','etl','analytics',
  'replica','primary','secondary','standby','slave','master','pgbouncer',
  'pgpool','proxysql','timescaledb','scylla','dynamodb','firestore',
];

const NETWORK = [
  'vpn','ssh','rdp','bastion','jumpbox','gateway','gw','fw','firewall',
  'router','switch','nat','waf','haproxy','nginx','apache','caddy',
  'traefik','envoy','istio','linkerd','proxy','squid','ns','dns','resolver',
  'ntp','snmp','syslog','radius','siem','ids','ips','soar','zerotier',
  'tailscale','wireguard','openvpn','ipsec','remote','jump',
];

const SECURITY = [
  'security','sec','vault','secrets','keys','pki','ca','certs','ocsp',
  'audit','compliance','iam','pam','threat','scan','scanner','vuln',
  'pentest','bugbounty','sonarqube','snyk','trivy','falco','defender',
  'guardduty','inspector','waf-mgmt','redteam','blueteam','soc',
];

const CLOUD = [
  'cloud','aws','azure','gcp','k8s','kubernetes','docker','container',
  'eks','aks','gke','openshift','rancher','registry','harbor','nexus',
  'internal','corp','intranet','private','office','hub','ecr','gcr','acr',
  'quay','portus','cluster','node','pod','ingress','loadbalancer','service',
];

const STORAGE = [
  'storage','files','ftp','sftp','ftps','upload','uploads','download',
  'downloads','share','shares','nas','san','nfs','samba','s3','bucket',
  'blobs','blob','objects','minio','swift','ceph','gluster','drive','box',
];

const ECOM = [
  'shop','store','cart','checkout','payment','payments','pay','billing',
  'invoice','invoices','orders','order','subscription','subscriptions',
  'fulfillment','shipping','catalog','products','inventory','pricing','pos',
  'marketplace','vendor','vendors','merchant','merchants','wallet','wallets',
  'coupon','coupons','promo','loyalty','rewards','wishlist',
];

const MARKETING = [
  'blog','news','press','marketing','ads','ad','campaign','campaigns',
  'analytics','track','tracking','pixel','tag','crm','erp','salesforce',
  'hubspot','mailchimp','marketo','segment','mixpanel','amplitude','heap',
  'hotjar','landing','affiliate','growth','seo','sem','ppc','social',
  'brand','content','cms','wordpress','drupal','ghost','contentful','strapi',
];

const SUPPORT = [
  'support','help','ticket','tickets','feedback','contact','faq','desk',
  'helpdesk','customer','community','forum','forums','chat','livechat',
  'chatbot','bot','onboarding','success','incident','changelog','roadmap',
  'maintenance','status-page','issues','escalation',
];

const MOBILE = [
  'mobile','m','ios','android','pwa','push','notifications','alert','alerts',
  'events','websocket','ws','socket','mqtt','deeplink','app-mobile',
];

const ENVS = [
  'dev','development','staging','stage','stg','uat','qa','sit','test',
  'testing','sandbox','sbx','demo','preview','preprod','pre','pre-prod',
  'perf','loadtest','canary','blue','green','shadow','prod','production',
  'live','local','feature','hotfix','next','current',
];

const FINANCE = [
  'finance','banking','bank','payments-api','payout','payouts','wallet',
  'ledger','treasury','accounting','payroll','tax','revenue','invoicing',
  'expense','budget','forex','fx','trading','trade','clearing','settlement',
  'reconciliation','risk','fraud','kyc','aml','swift','sepa','ach','wire',
  'stripe','braintree','adyen','worldpay','klarna',
];

const HR = [
  'hr','hris','hrms','people','talent','recruit','recruitment','ats',
  'careers','jobs','job','apply','onboarding','employee','employees',
  'directory','org','learning','lms','training','benefits','payroll',
  'timesheet','leave','absence','workforce','workday','bamboohr','adp',
];

const IOT = [
  'iot','device','devices','firmware','ota','telemetry','sensor','sensors',
  'actuator','gateway-iot','hub-iot','thing','things','fleet','provision',
  'provisioning','commands','digital-twin','mqtt-broker','edge-node',
  'edge-compute','scada','plc','hmi','lora','lorawan','tracking-iot',
];

const AI = [
  'ml','ai','llm','nlp','vision','inference','model','models','training',
  'feature-store','mlflow','kubeflow','ray','vertex','sagemaker','bedrock',
  'ollama','langchain','vector','vectordb','weaviate','pinecone','qdrant',
  'chroma','embeddings','notebook','notebooks','jupyter','airflow','prefect',
  'dagster','feast','dvc','bentoml','annotation','labeling','dataset',
];

const LEGAL = [
  'legal','law','privacy','terms','tos','contracts','contract','agreements',
  'nda','esign','docusign','records','retention','dsar','dpo','cookie',
  'gdpr','ccpa','compliance',
];

const GAMING = [
  'game','games','gaming','play','player','players','leaderboard','scores',
  'matchmaking','lobby','gs','gameapi','liveops','economy','items','guild',
  'guilds','clan','clans','friends','chat-game','voice','tournament',
  'esports','season','challenge','quest','studio','mod','workshop',
];

const HEALTH = [
  'health','healthcare','patient','patients','clinic','hospital','ehr','emr',
  'fhir','hl7','dicom','pacs','pharmacy','telemedicine','telehealth',
  'appointment','prescriptions','insurance','imaging','radiology','genomics',
];

const EDU = [
  'education','learn','learning','course','courses','class','classroom',
  'students','student','teacher','faculty','quiz','exam','grade','library',
  'research','lab','campus','university','college','school','elearning',
  'moodle','canvas','blackboard','lms',
];

const MISC = [
  'old','legacy','archive','backup','bak','tmp','temp','poc','pilot',
  'experimental','beta','alpha','nightly','release','update','auto',
  'scheduler','cron','worker','workers','queue','broker','kafka','rabbitmq',
  'celery','sidekiq','deprecated','retired','defunct','sandbox','labs',
];

// ─────────────────────────────────────────────────────────────────────────────
// MODIFIER POOLS
// ─────────────────────────────────────────────────────────────────────────────

const NUM_SMALL   = Array.from({length:  99}, (_, i) => String(i + 1));
const NUM_LARGE   = Array.from({length: 999}, (_, i) => String(i + 1));
const LETTERS     = 'abcdefghijklmnopqrstuvwxyz'.split('');

const ENV_PREFIXES = [
  'dev','staging','stage','stg','uat','qa','sit','test','sandbox','demo',
  'preview','preprod','prod','live','canary','blue','green','internal',
  'private','corp','int','ext','legacy','old','new','next','v2','v3',
];

const REGION_PREFIXES = [
  'us','us-east','us-west','us-central','us-east-1','us-east-2',
  'us-west-1','us-west-2','us-central-1',
  'eu','eu-west','eu-central','eu-north','eu-south',
  'eu-west-1','eu-west-2','eu-west-3','eu-central-1','eu-north-1',
  'ap','ap-east','ap-southeast','ap-northeast','ap-south',
  'ap-southeast-1','ap-southeast-2','ap-northeast-1','ap-northeast-2','ap-south-1',
  'me','me-south','me-central','af','af-south','sa','sa-east',
  'ca','ca-central','cn','cn-north','cn-northwest','gov',
  'nyc','sfo','lon','ams','fra','sgp','blr','syd','tok','sea',
  'chi','dal','atl','lax','mia','tor','par','mum','dxb','hkg',
  'r1','r2','r3','r4','r5',
  'dc1','dc2','dc3','dc4',
  'edge','pop','node','zone',
];

const API_SUFFIXES = [
  'api','rest','graphql','grpc','rpc','endpoint','gateway','service','svc',
];

const ENV_SUFFIXES = [
  'dev','prod','staging','stage','test','qa','uat','sandbox','demo',
  'live','new','old','internal','private','external','public',
];

const TYPE_SUFFIXES = [
  'server','node','host','cluster','instance','proxy','lb','db','cache',
  'worker','scheduler','queue','consumer','producer','listener','handler',
  'manager','controller','router','agent','monitor','collector','reporter',
];

const TECH_SUFFIXES = [
  'api','app','web','db','svc','admin','portal','panel','console','dashboard',
  'ui','backend','frontend','service','gateway','proxy','cache','storage',
  'worker','bot','jobs','hook','stream','sync','push','pull','feed','hub',
];

// ─────────────────────────────────────────────────────────────────────────────
// CITY / AIRPORT CODE POOL (for geo-distributed infra)
// ─────────────────────────────────────────────────────────────────────────────

const GEO_CODES = [
  'nyc1','nyc2','nyc3','sfo1','sfo2','sfo3','lon1','lon2','lon3',
  'ams1','ams2','ams3','fra1','fra2','fra3','sgp1','sgp2','sgp3',
  'blr1','blr2','syd1','syd2','tok1','tok2','sea1','sea2',
  'chi1','chi2','dal1','dal2','atl1','atl2','lax1','lax2',
  'mia1','mia2','tor1','tor2','par1','par2','mum1','mum2',
  'dxb1','dxb2','hkg1','hkg2','bom1','del1','cpt1','jnb1',
  'gig1','gru1','mex1','bog1','lim1','scl1',
  'iad1','iad2','dca1','bos1','phi1','ord1','msp1','den1',
  'phx1','slc1','pdx1','bna1','cle1','pit1','mci1','stl1',
  'tyo1','tyo2','nrt1','nrt2','osp1','osa1','sel1','sel2',
  'pek1','pvg1','sha1','hkg3','sin1','sin2','kul1','bkk1',
  'bom2','del2','hyd1','maa1','ccu1','ahm1',
  'dub1','mad1','bcn1','mil1','rom1','vie1','zur1','sto1',
  'hel1','cop1','bru1','lis1','war1','bud1','pra1','buc1',
  'sof1','bel1','skp1','lju1','zag1','sar1','tir1','chi3',
  'cai1','lgo1','nbi1','dar1','add1','acc1','cmn1','tun1',
];

// ─────────────────────────────────────────────────────────────────────────────
// ALL BASE WORDS (union of every pool)
// ─────────────────────────────────────────────────────────────────────────────

const ALL_BASE = [
  ...WEB,...API,...AUTH,...MAIL,...DEV_OPS,...SOURCE,...MONITORING,
  ...DATABASE,...NETWORK,...SECURITY,...CLOUD,...STORAGE,...ECOM,
  ...MARKETING,...SUPPORT,...MOBILE,...ENVS,...FINANCE,...HR,...IOT,
  ...AI,...LEGAL,...GAMING,...HEALTH,...EDU,...MISC,
];

// De-duplicate base words
const BASE_SET = [...new Set(ALL_BASE)];

// ─────────────────────────────────────────────────────────────────────────────
// GENERATION FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const seen = new Set();
const words = [];

function add(w) {
  const clean = w.trim().toLowerCase();
  // Basic validation: only allow valid subdomain chars, reasonable length
  if (!clean || clean.length < 1 || clean.length > 63) return;
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(clean) && !/^[a-z0-9]$/.test(clean)) return;
  if (seen.has(clean)) return;
  seen.add(clean);
  words.push(clean);
}

// 1. All base words as-is
console.log('Phase 1: Base words…');
BASE_SET.forEach(add);

// 2. Base + small numbers (1–99)
console.log('Phase 2: Base + numbers 1–99…');
for (const base of BASE_SET) {
  for (const n of NUM_SMALL) {
    add(`${base}${n}`);
    add(`${base}-${n}`);
  }
}

// 3. Important services + larger numbers (100–999)
console.log('Phase 3: Core services + numbers 100–999…');
const CORE_SERVICES = [
  'web','app','api','db','server','node','host','mail','smtp','vpn',
  'dev','prod','staging','test','qa','sandbox','cdn','git','build',
  'deploy','ci','monitor','grafana','redis','mysql','postgres','proxy',
  'lb','ns','dns','mx','ftp','sftp','storage','k8s','docker',
];
for (const base of CORE_SERVICES) {
  for (const n of NUM_LARGE) {
    add(`${base}${n}`);
    add(`${base}-${n}`);
  }
}

// 4. env-prefix + base
console.log('Phase 4: ENV prefix + base…');
for (const prefix of ENV_PREFIXES) {
  for (const base of BASE_SET) {
    add(`${prefix}-${base}`);
  }
}

// 5. region-prefix + base
console.log('Phase 5: Region prefix + base…');
for (const prefix of REGION_PREFIXES) {
  for (const base of BASE_SET) {
    add(`${prefix}-${base}`);
  }
}

// 6. base + api/env/tech suffixes
console.log('Phase 6: Base + suffixes…');
const ALL_SUFFIXES = [...new Set([...API_SUFFIXES,...ENV_SUFFIXES,...TYPE_SUFFIXES,...TECH_SUFFIXES])];
for (const base of BASE_SET) {
  for (const suf of ALL_SUFFIXES) {
    if (suf !== base) {
      add(`${base}-${suf}`);
    }
  }
}

// 7. Single letter + base (a-web, b-api, …)
console.log('Phase 7: Letter prefix + base…');
for (const letter of LETTERS) {
  for (const base of BASE_SET) {
    add(`${letter}-${base}`);
  }
}

// 8. Geographic code entries
console.log('Phase 8: Geo codes…');
for (const geo of GEO_CODES) {
  add(geo);
  for (const base of ['api','app','web','db','vpn','git','jenkins','grafana','mail','smtp','cdn','storage']) {
    add(`${geo}-${base}`);
    add(`${base}-${geo}`);
  }
}

// 9. v1–v20 variants of common services
console.log('Phase 9: Version variants…');
const VERSION_TARGETS = [
  'api','web','app','backend','service','gateway','proxy','auth','sso',
  'platform','portal','dashboard','admin','shop','store','billing',
];
for (const t of VERSION_TARGETS) {
  for (let v = 1; v <= 20; v++) {
    add(`${t}-v${v}`);
    add(`v${v}-${t}`);
    add(`${t}v${v}`);
  }
}

// 10. Numbered environment variants
console.log('Phase 10: Env + numbers…');
const ENV_NUMBERED = ['dev','staging','stage','test','qa','uat','sandbox','prod','demo','preview'];
for (const e of ENV_NUMBERED) {
  for (let n = 1; n <= 20; n++) {
    add(`${e}${n}`);
    add(`${e}-${n}`);
  }
}

// 11. Two-word combos: important service + important service
console.log('Phase 11: Service pairs…');
const PAIR_A = ['api','web','app','auth','admin','mail','db','git','ci','monitor','dev','prod'];
const PAIR_B = ['server','gateway','proxy','node','host','cluster','lb','cache','worker','svc'];
for (const a of PAIR_A) {
  for (const b of PAIR_B) {
    if (a !== b) {
      add(`${a}-${b}`);
      add(`${b}-${a}`);
    }
  }
}

// 12. DC/datacenter naming conventions
console.log('Phase 12: Datacenter naming…');
for (let dc = 1; dc <= 20; dc++) {
  add(`dc${dc}`);
  add(`datacenter${dc}`);
  add(`dc-${dc}`);
  for (const base of ['web','api','db','app','mail','vpn','monitor','git']) {
    add(`dc${dc}-${base}`);
    add(`${base}-dc${dc}`);
  }
}

// 13. pod / container naming
console.log('Phase 13: K8s / container naming…');
const K8S_PREFIXES = ['pod','node','worker','runner','agent','collector','exporter'];
for (const kp of K8S_PREFIXES) {
  for (let n = 1; n <= 50; n++) {
    add(`${kp}${n}`);
    add(`${kp}-${n}`);
  }
}

// 14. Build/deploy numbered hosts
console.log('Phase 14: Build/deploy hosts…');
const BUILD_HOSTS = ['build','builder','runner','agent','executor','worker'];
for (const bh of BUILD_HOSTS) {
  for (let n = 1; n <= 99; n++) {
    add(`${bh}${n}`);
    add(`${bh}-${n}`);
  }
}

// 15. Customer / tenant portals
console.log('Phase 15: Tenant portals…');
const TENANT_WORDS = ['tenant','customer','client','account','org','team','workspace'];
for (const tw of TENANT_WORDS) {
  for (let n = 1; n <= 50; n++) {
    add(`${tw}${n}`);
    add(`${tw}-${n}`);
  }
}

console.log(`\n✅ Generated ${words.length.toLocaleString()} unique entries`);

// ─────────────────────────────────────────────────────────────────────────────
// MERGE WITH EXISTING WORDLIST AND WRITE
// ─────────────────────────────────────────────────────────────────────────────

// Load the existing wordlist and add those to seen set too
let existingWords = [];
try {
  const existing = readFileSync(WORDLIST_PATH, 'utf8');
  existingWords = existing
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
} catch {
  // file doesn't exist yet
}

console.log(`Existing wordlist: ${existingWords.length.toLocaleString()} words`);

// Write the final combined wordlist
const header = `# subenum — combined subdomain wordlist
# Generated by generate-wordlist.js — ${new Date().toISOString()}
# ${words.length.toLocaleString()} machine-generated entries + curated base words
# Format: one prefix per line
#
`;

const allWords = [...new Set([...existingWords, ...words])].sort();
const output   = header + allWords.join('\n') + '\n';

writeFileSync(OUT_PATH, output, 'utf8');
console.log(`📝 Written ${allWords.length.toLocaleString()} total unique words → ${OUT_PATH}`);
