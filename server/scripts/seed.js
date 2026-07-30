'use strict';
/*
 * Seeds a ready-to-use clinic:
 *   1 admin, 5 therapists, 10 parents, 10 children (goals, sessions,
 *   home programmes, 11-domain progress history, baseline assessment, tools).
 * All accounts use the password below — CHANGE IT after first login.
 */
const { pool, tx } = require('../src/db');
const auth = require('../src/auth');
const config = require('../src/config');

const DEFAULT_PASSWORD = process.env.SEED_PASSWORD || 'demo1234';

const DOMAINS = ["Communication","Social Skills","Play Skills","Attention","Sensory Processing","Fine Motor","Gross Motor","Activities of Daily Living","Emotional Regulation","School Readiness","Goal Achievement"];
const COLORS = ['#3B82F6','#6366F1','#0EA5E9','#14B8A6','#F59E0B','#EC4899','#8B5CF6','#10B981','#EF4444','#0891B2'];
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const initials = (n) => { const p = n.trim().split(/\s+/); return ((p[0][0] || '') + (p[p.length - 1][0] || '')).toUpperCase(); };
const daysAgo = (d) => { const x = new Date(); x.setDate(x.getDate() - d); return x; };

const THERAPISTS = [
  { name: 'Dr. Sarah Chen', email: 'sarah@lptclinic.com', title: 'Occupational Therapist', spec: 'Occupational Therapy' },
  { name: 'Rachel Adams', email: 'rachel@lptclinic.com', title: 'Speech & Language Therapist', spec: 'Speech Therapy' },
  { name: 'Michael Tan', email: 'michael@lptclinic.com', title: 'Physiotherapist', spec: 'Physiotherapy' },
  { name: 'Priya Nair', email: 'priya@lptclinic.com', title: 'Behaviour Therapist', spec: 'Behaviour Therapy' },
  { name: 'James Wong', email: 'james@lptclinic.com', title: 'Early Intervention Specialist', spec: 'Early Intervention' },
];

const PARENTS = ['Aisha','Ben','Carmen','Deepa','Emma','Farid','Grace','Hassan','Ivy','Julia'];

const CHILDREN = [
  { name: 'Ethan Lim', g: 'Male', months: 42, diag: 'Autism Spectrum Disorder', th: 0, focus: ['Communication','Social Skills','Play Skills'] },
  { name: 'Sophia Rahman', g: 'Female', months: 55, diag: 'Global Developmental Delay', th: 1, focus: ['Communication','Attention','Fine Motor'] },
  { name: 'Aidan Cooper', g: 'Male', months: 38, diag: 'Speech & Language Delay', th: 1, focus: ['Communication','Social Skills'] },
  { name: 'Mia Fernandez', g: 'Female', months: 60, diag: 'Sensory Processing Disorder', th: 0, focus: ['Sensory Processing','Emotional Regulation','Attention'] },
  { name: 'Lucas Nguyen', g: 'Male', months: 48, diag: 'Developmental Coordination Disorder', th: 2, focus: ['Gross Motor','Fine Motor'] },
  { name: 'Zara Ali', g: 'Female', months: 33, diag: 'Autism Spectrum Disorder', th: 3, focus: ['Social Skills','Emotional Regulation','Communication'] },
  { name: 'Oliver Brooks', g: 'Male', months: 66, diag: 'ADHD', th: 3, focus: ['Attention','Emotional Regulation','School Readiness'] },
  { name: 'Chloe Tan', g: 'Female', months: 45, diag: 'Cerebral Palsy (mild)', th: 2, focus: ['Gross Motor','Activities of Daily Living'] },
  { name: 'Noah Patel', g: 'Male', months: 51, diag: 'Speech Sound Disorder', th: 4, focus: ['Communication','Play Skills'] },
  { name: 'Layla Hassan', g: 'Female', months: 39, diag: 'Developmental Delay', th: 4, focus: ['Communication','Fine Motor','School Readiness'] },
];

const STANDARD_TOOLS = [
  { code: 'FEAS', name: 'Functional Emotional Assessment Scale' },
  { code: 'SRS-2', name: 'Social Responsiveness Scale, 2nd Ed.' },
  { code: 'SGS-2', name: 'Schedule of Growing Skills II' },
  { code: 'SPM-2', name: 'Sensory Processing Measure, 2nd Ed.' },
];
const toolResult = {
  FEAS: () => pick(['Age-appropriate capacities emerging', 'Constricted range at higher levels', 'Delays in shared attention & engagement']),
  'SRS-2': () => { const t = rand(60, 84); return `T-score ${t} — ${t >= 76 ? 'severe' : t >= 66 ? 'moderate' : 'mild'} range`; },
  'SGS-2': () => pick(['Profile below chronological age in language & social skills', 'Even profile, mild global delay']),
  'SPM-2': () => { const t = rand(59, 78); return `T-score ${t} — ${t >= 70 ? 'definite' : 'some'} difference in sensory processing`; },
};

const subj = ['Parent reports improved engagement at home this week.', 'Parent notes some difficulty with transitions.', 'Child arrived settled and ready to participate.', 'Parent reports good carryover of home activities.'];
const obj = ['Child engaged in structured table-top tasks for 12 minutes with two prompts.', 'Demonstrated emerging turn-taking during play.', 'Required moderate support to sustain attention.', 'Completed fine-motor tasks with improved grasp.'];
const asmt = ['Steady progress toward current goals.', 'Skills generalising across activities.', 'Continued support needed for regulation.', 'Good response to visual supports.'];
const plan = ['Continue current goals; increase task complexity next session.', 'Introduce peer-play opportunities.', 'Maintain sensory diet and review in two weeks.', 'Progress home programme difficulty.'];

const HP_BANK = [
  { t: 'Bubble Communication Game', obj: 'Encourage requesting', mat: 'Bubbles', freq: 'Daily, 10 min', instr: 'Blow bubbles and pause, waiting for your child to request "more" using a word, sign or gesture before continuing.', out: 'Increased spontaneous requests' },
  { t: 'Mealtime Exploration', obj: 'Expand food acceptance', mat: 'New & familiar foods', freq: 'Daily at meals', instr: 'Offer one new food beside a familiar favourite. Touching, smelling or licking all count as brave tries.', out: 'Tolerates a wider range of foods' },
  { t: 'Turn-Taking with Family', obj: 'Build social reciprocity', mat: 'Simple board game', freq: '3x per week', instr: 'Play a short turn-taking game using clear language: "my turn", "your turn".', out: 'Waits and takes turns with support' },
  { t: 'Sensory Bin Discovery', obj: 'Increase sensory tolerance', mat: 'Rice or pasta, cups', freq: '3x per week', instr: 'Hide small toys in a dry sensory bin to find. Let your child explore at their own pace.', out: 'Explores textures with growing comfort' },
];

const GOAL_TEMPLATES = {
  'Communication': 'Use 3–5 word phrases to request and comment across settings',
  'Social Skills': 'Initiate play with a peer and sustain interaction for 5 minutes',
  'Play Skills': 'Engage in pretend play sequences with 3+ steps',
  'Attention': 'Sustain attention to a structured task for 10 minutes with one prompt',
  'Sensory Processing': 'Tolerate messy-play textures for 5 minutes independently',
  'Fine Motor': 'Demonstrate a functional tripod grasp for pre-writing',
  'Gross Motor': 'Walk along a balance beam with independent stepping',
  'Activities of Daily Living': 'Complete hand-washing routine with visual support',
  'Emotional Regulation': 'Use a calm-down strategy when frustrated with minimal support',
  'School Readiness': 'Follow a 2-step classroom instruction within a group',
};

function pctFromAnswers(a) { const s = a.reduce((x, y) => x + y, 0); return Math.round((s / (a.length * 4)) * 100); }

async function main() {
  await tx(async (c) => {
    // wipe (idempotent reseed)
    await c.query('TRUNCATE reports, activities, assessment_tools, assessments, progress_points, home_programmes, soap_sessions, goals, children RESTART IDENTITY CASCADE');
    await c.query("DELETE FROM users");

    const hash = await auth.hashPassword(DEFAULT_PASSWORD);

    // clinic
    await c.query(
      `INSERT INTO clinic_settings (id,name,tagline,address,phone,email,updated_at)
       VALUES (1,$1,$2,$3,$4,$5,now())
       ON CONFLICT (id) DO UPDATE SET name=$1,tagline=$2,address=$3,phone=$4,email=$5,updated_at=now()`,
      [config.clinic.name, config.clinic.tagline, config.clinic.address, config.clinic.phone, config.clinic.email]
    );

    // admin
    await c.query(
      `INSERT INTO users (role,name,email,password_hash,title,initials,color)
       VALUES ('admin','Clinic Administrator','admin@lptclinic.com',$1,'Administrator','CA','#0B1F3A')`, [hash]);

    // therapists
    const thIds = [];
    for (let i = 0; i < THERAPISTS.length; i++) {
      const t = THERAPISTS[i];
      const { rows } = await c.query(
        `INSERT INTO users (role,name,email,password_hash,title,spec,initials,color)
         VALUES ('therapist',$1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [t.name, t.email, hash, t.title, t.spec, initials(t.name), COLORS[i % COLORS.length]]);
      thIds.push(rows[0].id);
    }

    // parents
    const parentEmails = [];
    for (let i = 0; i < PARENTS.length; i++) {
      const first = PARENTS[i];
      const email = `${first.toLowerCase()}@family.com`;
      parentEmails.push({ email, name: `${first} ${pick(['Lim','Rahman','Cooper','Tan','Patel','Ali','Brooks','Hassan'])}` });
      await c.query(
        `INSERT INTO users (role,name,email,password_hash,initials,color)
         VALUES ('parent',$1,$2,$3,$4,$5)`,
        [parentEmails[i].name, email, hash, initials(parentEmails[i].name), COLORS[(i + 3) % COLORS.length]]);
    }

    // children
    for (let i = 0; i < CHILDREN.length; i++) {
      const cd = CHILDREN[i];
      const dob = new Date(); dob.setMonth(dob.getMonth() - cd.months);
      const parent = parentEmails[i];
      const therapistId = thIds[cd.th];
      const { rows: crows } = await c.query(
        `INSERT INTO children (name,gender,dob,diagnosis,referral,address,therapist_id,parent_email,parent_name,color,initials,status,start_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',$12) RETURNING id`,
        [cd.name, cd.g, dob, cd.diag, pick(['Paediatrician referral', 'Parent self-referral', 'School referral']),
         pick(['12 Maple Grove', '88 Riverside Ave', '4 Orchard Lane', '203 Hillcrest Rd']),
         therapistId, parent.email, parent.name, COLORS[i % COLORS.length], initials(cd.name), daysAgo(rand(180, 300))]);
      const childId = crows[0].id;

      // progress history: 8 monthly points per domain, trending up
      const base = {}; DOMAINS.forEach((d) => (base[d] = rand(28, 52)));
      for (const d of DOMAINS) {
        let v = base[d];
        for (let m = 7; m >= 0; m--) {
          v += rand(1, 7); if (v > 96) v = 96;
          const dt = new Date(); dt.setMonth(dt.getMonth() - m); dt.setDate(15);
          await c.query('INSERT INTO progress_points (child_id,domain,value,recorded_at) VALUES ($1,$2,$3,$4)', [childId, d, Math.round(v), dt]);
        }
      }

      // baseline assessment reproducing intake scores
      const answers = {}, scores = {};
      for (const d of DOMAINS) {
        const intake = base[d];
        let total = Math.round((intake / 100) * 20);
        const a = [];
        for (let q = 0; q < 5; q++) { const give = Math.min(4, Math.max(0, Math.round(total / (5 - q)))); a.push(give); total -= give; }
        answers[d] = a; scores[d] = pctFromAnswers(a);
      }
      await c.query('INSERT INTO assessments (child_id,therapist_id,date,answers,scores,done) VALUES ($1,$2,$3,$4,$5,TRUE)',
        [childId, therapistId, daysAgo(rand(160, 290)), JSON.stringify(answers), JSON.stringify(scores)]);

      // 2 standardised tools
      const chosen = [...STANDARD_TOOLS].sort(() => Math.random() - 0.5).slice(0, 2);
      for (const tp of chosen) {
        await c.query('INSERT INTO assessment_tools (child_id,code,name,tool_date,result,notes) VALUES ($1,$2,$3,$4,$5,$6)',
          [childId, tp.code, tp.name, daysAgo(rand(160, 290)), toolResult[tp.code](), pick(['Assessed at intake.', 'Parent interview + direct observation.', 'Baseline measure prior to intervention.'])]);
      }

      // goals
      for (const f of cd.focus) {
        await c.query(
          `INSERT INTO goals (child_id,title,domain,target,progress,status,started)
           VALUES ($1,$2,$3,$4,$5,'active',$6)`,
          [childId, GOAL_TEMPLATES[f] || `Improve ${f}`, f, rand(70, 90), rand(30, 75), daysAgo(rand(120, 200))]);
      }
      // one achieved goal
      await c.query(
        `INSERT INTO goals (child_id,title,domain,target,progress,status,started)
         VALUES ($1,'Respond to name across 4/5 opportunities','Attention',100,100,'achieved',$2)`,
        [childId, daysAgo(200)]);

      // home programmes (2)
      const hps = [...HP_BANK].sort(() => Math.random() - 0.5).slice(0, 2);
      for (const h of hps) {
        await c.query(
          `INSERT INTO home_programmes (child_id,title,objective,materials,instructions,frequency,outcome,completion,status,assigned_by,assigned)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10)`,
          [childId, h.t, h.obj, h.mat, h.instr, h.freq, h.out, rand(20, 80), therapistId, daysAgo(rand(20, 90))]);
      }

      // signed SOAP sessions (5)
      for (let s = 0; s < 5; s++) {
        const worked = cd.focus.slice(0, rand(1, cd.focus.length));
        const first = cd.name.split(' ')[0];
        await c.query(
          `INSERT INTO soap_sessions
            (child_id,therapist_id,date,duration,subjective,objective,assessment,plan,activities,response,observation,parent_summary,home_programme,next_plan,goals_worked,signed,is_draft,signature)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE,FALSE,$16)`,
          [childId, therapistId, daysAgo(s * 14 + rand(1, 6)), rand(30, 60), pick(subj), pick(obj), pick(asmt), pick(plan),
           JSON.stringify([pick(['Bubble play', 'Inset puzzle', 'Obstacle course', 'Turn-taking game', 'Sensory bin'])]),
           pick(['Engaged well', 'Needed encouragement', 'Enjoyed the activities']),
           pick(['Good eye contact noted', 'Improved sitting tolerance', 'Sought sensory input']),
           `Today ${first} worked hard on ${worked.join(' and ').toLowerCase()}. Please try the home programme this week!`,
           pick(HP_BANK).t, pick(plan), JSON.stringify(worked), THERAPISTS[cd.th].name]);
      }

      await c.query('INSERT INTO activities (txt,ico,color,child_id,when_ms) VALUES ($1,$2,$3,$4,$5)',
        [`${cd.name} enrolled`, 'children', '#3B82F6', childId, daysAgo(rand(1, 30)).getTime()]);
    }
  });

  console.log('Seed complete.');
  console.log('----------------------------------------------------');
  console.log('Login accounts (password for all):', DEFAULT_PASSWORD);
  console.log('  Admin     : admin@lptclinic.com');
  console.log('  Therapist : sarah@lptclinic.com (and rachel/michael/priya/james@lptclinic.com)');
  console.log('  Parent    : aisha@family.com (and ben/carmen/... @family.com)');
  console.log('  >>> CHANGE THESE PASSWORDS after first login. <<<');
  console.log('----------------------------------------------------');
}

main()
  .then(() => pool.end())
  .catch((e) => { console.error('Seed failed:', e); pool.end(); process.exit(1); });
