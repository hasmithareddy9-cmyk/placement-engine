require('dotenv').config();
const express=require('express'),fs=require('fs'),path=require('path'),crypto=require('crypto'),nodemailer=require('nodemailer'),cron=require('node-cron'),EventEmitter=require('events');
const F=path.join(__dirname,'data','db.json'),bus=new EventEmitter(),app=express();app.use(express.json());
const id=()=>crypto.randomBytes(6).toString('hex'),hash=p=>crypto.scryptSync(p,'campus-salt',32).toString('hex');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SKILLS=['python','java','javascript','react','node','sql','mongodb','html','css','machine learning','django','aws','docker','git','c++','excel','tableau','figma','typescript','data analysis'];
const RES={python:'Python for Everybody (Coursera, free audit)',java:'Java Programming (MOOC.fi)',javascript:'javascript.info',react:'react.dev/learn',node:'Node.js docs + The Odin Project',sql:'SQLBolt',mongodb:'MongoDB University free courses',docker:'Docker getting-started docs','machine learning':'Andrew Ng ML course',aws:'AWS Skill Builder free tier',git:'Pro Git book (free)',tableau:'Tableau free training videos'};
let db;const save=()=>fs.writeFileSync(F,JSON.stringify(db,null,1));
const log=(type,msg,ok=true)=>{db.logs.unshift({at:new Date().toISOString(),type,msg,ok});db.logs=db.logs.slice(0,300);save();};
const extract=t=>SKILLS.filter(s=>new RegExp('\\b'+s.replace('+','\\+')+(s==='c++'?'':'\\b'),'i').test(t||''));
const mkS=(n,b,g,c,sk,loc,int,share,pr)=>({id:id(),name:n,email:`${n.split(' ')[0].toLowerCase()}@example.test`,branch:b,gradYear:2026,cgpa:c,skills:sk,locations:loc,interests:int,projects:pr,portfolio:`https://github.com/sample-${n.split(' ')[0].toLowerCase()}`,consent:{alerts:true,share:share}});
function seed(){
 const S=[mkS('Asha Rao','CSE',0,8.6,['python','sql','machine learning','git'],['Hyderabad','Remote'],['data','software'],true,['Churn predictor (scikit-learn)']),
 mkS('Ravi Kumar','CSE',0,7.4,['java','sql','git','html'],['Bengaluru'],['software','backend'],true,['Library management system']),
 mkS('Meena Iyer','IT',0,9.0,['javascript','react','node','mongodb','css','git'],['Hyderabad','Remote'],['web','software','full stack'],true,['MERN e-commerce app']),
 mkS('Karan Shah','ECE',0,6.8,['c++','python'],['Pune'],['embedded','software'],false,['Arduino weather station']),
 mkS('Divya Nair','CSE',0,8.1,['python','django','sql','docker','aws'],['Hyderabad','Chennai'],['backend','software','cloud'],false,['Django blog + CI/CD']),
 mkS('Imran Ali','IT',0,7.9,['javascript','typescript','react','html','css','figma'],['Remote'],['frontend','web'],true,['Portfolio design system'])];
 const U=[{id:id(),email:'admin@campus.test',pw:hash('admin123'),role:'admin',name:'Placement Officer'},{id:id(),email:'recruiter@acme.test',pw:hash('recruit123'),role:'recruiter',name:'Acme HR',company:'Acme Tech'}];
 S.forEach(s=>U.push({id:id(),email:s.email,pw:hash('student123'),role:'student',name:s.name,sid:s.id}));
 db={users:U,students:S,jobs:[],emails:[],logs:[],paused:false};
 [['Backend Developer','Acme Tech','Hyderabad',['python','sql','docker','git'],6.5,['CSE','IT'],'2027-12-31'],['Data Analyst Intern','DataWorks','Remote',['python','sql','excel','tableau'],7,['CSE','IT','ECE'],'2027-12-31'],['Frontend Engineer','PixelCraft','Remote',['javascript','react','css','figma'],7,['CSE','IT'],'2027-12-31']]
 .forEach(j=>addJob({title:j[0],company:j[1],location:j[2],skills:j[3],minCgpa:j[4],branches:j[5],gradYears:[2026],deadline:j[6],url:'https://example.com/careers/'+id(),recruiterEmail:j[1]==='Acme Tech'?'recruiter@acme.test':''},'seed',true));
 save();}
function addJob(r,source='manual',quiet=false){
 const key=[r.company,r.title,r.location].join('|').toLowerCase();
 if(db.jobs.some(j=>j.key===key)){log('discovery',`Duplicate skipped: ${r.title} @ ${r.company}`);return{dup:true};}
 const expired=new Date(r.deadline)<new Date(),j={id:id(),key,title:r.title,company:r.company,location:r.location,skills:(r.skills||[]).map(s=>s.toLowerCase()),minCgpa:+r.minCgpa||0,branches:r.branches||[],gradYears:(r.gradYears||[2026]).map(Number),deadline:r.deadline,url:r.url,recruiterEmail:r.recruiterEmail||'',source,sample:source==='seed'||source==='sample-feed',status:expired?'expired':'active',addedAt:new Date().toISOString()};
 db.jobs.push(j);log('discovery',`${expired?'Expired job stored':'New job'}: ${j.title} @ ${j.company} (source: ${source})`);save();
 if(!expired&&!quiet)bus.emit('job.created',j);return{job:j};}
function match(s,j){
 if(s.cgpa<j.minCgpa)return{eligible:false,why:`CGPA below ${j.minCgpa}`};
 if(j.branches.length&&!j.branches.includes(s.branch))return{eligible:false,why:'Branch not eligible'};
 if(!j.gradYears.includes(s.gradYear))return{eligible:false,why:'Graduation year not eligible'};
 const have=j.skills.filter(k=>s.skills.includes(k)),missing=j.skills.filter(k=>!s.skills.includes(k));
 const sk=j.skills.length?have.length/j.skills.length:1,int=s.interests.some(i=>j.title.toLowerCase().includes(i.toLowerCase()))?1:0,loc=(j.location==='Remote'||s.locations.includes(j.location))?1:0,cg=Math.min(1,(s.cgpa-j.minCgpa)/2);
 const score=Math.round(100*(.6*sk+.2*int+.1*loc+.1*cg));
 const explanation=`AI-generated explanation: you have ${have.length}/${j.skills.length} required skills (${have.join(', ')||'none'}); ${int?'role matches your interests; ':''}${loc?'location fits your preference; ':'location differs from your preference; '}you meet all eligibility rules. This is a fit estimate, not a prediction of selection.`;
 return{eligible:true,score,have,missing,explanation,resources:missing.map(m=>RES[m]||'Search free tutorials for '+m)};}
let tp;async function transport(){if(tp)return tp;const e=process.env;if(e.SMTP_HOST)tp=nodemailer.createTransport({host:e.SMTP_HOST,port:+e.SMTP_PORT||587,auth:{user:e.SMTP_USER,pass:e.SMTP_PASS}});else{const a=await nodemailer.createTestAccount();tp=nodemailer.createTransport({host:a.smtp.host,port:a.smtp.port,secure:a.smtp.secure,auth:{user:a.user,pass:a.pass}});}return tp;}
async function sendMail(kind,to,subject,html,key,meta={}){
 if(db.emails.some(e=>e.key===key&&e.status==='sent'))return; // duplicate prevention
 let r=db.emails.find(e=>e.key===key);if(!r){r={id:id(),key,kind,to,subject,status:'pending',at:new Date().toISOString(),...meta};db.emails.unshift(r);}
 try{const i=await(await transport()).sendMail({from:process.env.MAIL_FROM||'placement@campus.test',to,subject,html});r.status='sent';r.preview=nodemailer.getTestMessageUrl(i)||null;r.error=null;log('email',`${kind} email sent: ${subject}`);}
 catch(e){r.status='failed';r.error=e.message;log('email',`${kind} email FAILED: ${e.message}`,false);}save();}
const base=()=>process.env.BASE_URL||'http://localhost:3000';
const studentMail=(s,j,m)=>`<h3>New opportunity: ${esc(j.title)} at ${esc(j.company)}</h3><p>Hi ${esc(s.name)},</p><ul><li>Location: ${esc(j.location)}</li><li>Eligibility: CGPA ≥ ${j.minCgpa}, ${esc(j.branches.join('/')||'all branches')}, batch ${j.gradYears.join('/')}</li><li>Required skills: ${esc(j.skills.join(', '))}</li><li>Deadline: ${esc(j.deadline)}</li><li>Match score: <b>${m.score}%</b> (not a guarantee of selection)</li><li>Missing skills: ${esc(m.missing.join(', ')||'none')}</li></ul><p>${esc(m.explanation)}</p><p><a href="${esc(j.url)}">Official application link</a> — please verify details on the original listing.</p><small><a href="${base()}/unsubscribe/${s.id}">Unsubscribe from job alerts</a></small>`;
async function processJob(j,only){
 if(db.paused)return log('automation','Paused: skipped job '+j.title);
 for(const s of db.students){if(only&&s.id!==only)continue;
  if(!s.consent.alerts)continue;const m=match(s,j);
  if(m.eligible&&m.score>=50)await sendMail('student',s.email,`${j.title} at ${j.company} (${m.score}% match)`,studentMail(s,j,m),`s:${s.id}:${j.id}`,{studentId:s.id,jobId:j.id,score:m.score});}
 if(only||!j.recruiterEmail)return;
 const list=db.students.filter(s=>s.consent.share).map(s=>({s,m:match(s,j)})).filter(x=>x.m.eligible&&x.m.score>=50).sort((a,b)=>b.m.score-a.m.score).slice(0,10);
 if(!list.length)return log('recruiter',`No consent-approved eligible candidates for ${j.title}`);
 const rows=list.map(({s,m})=>`<tr><td>${esc(s.name)}</td><td>${esc(s.branch)}, CGPA ${s.cgpa}, ${s.gradYear}</td><td>${esc(s.skills.join(', '))}</td><td>${esc(s.projects.join('; '))}</td><td><a href="${esc(s.portfolio)}">link</a></td><td>${m.score}%</td></tr>`).join('');
 await sendMail('recruiter',j.recruiterEmail,`Candidate shortlist for ${j.title} (${list.length})`,`<h3>Shortlist: ${esc(j.title)}</h3><p>Only students who consented to profile sharing are listed. Contact details are withheld; contact via the placement cell.</p><table border=1 cellpadding=6><tr><th>Name</th><th>Education</th><th>Skills</th><th>Projects</th><th>Portfolio</th><th>Fit</th></tr>${rows}</table>`,`r:${j.id}`,{jobId:j.id,count:list.length});}
bus.on('job.created',j=>processJob(j).catch(e=>log('automation',e.message,false)));
bus.on('student.updated',async s=>{if(db.paused)return;for(const j of db.jobs.filter(x=>x.status==='active'))await processJob(j,s.id);});
const FEED=[{title:'Software Developer',company:'Acme Tech',location:'Hyderabad',skills:['python','sql','git','docker'],minCgpa:7,branches:['CSE','IT'],gradYears:[2026],deadline:'2027-11-30',url:'https://example.com/careers/sd1',recruiterEmail:'recruiter@acme.test'},{title:'Full Stack Intern',company:'WebNest',location:'Remote',skills:['javascript','react','node','mongodb'],minCgpa:7.5,branches:['CSE','IT'],gradYears:[2026],deadline:'2027-10-30',url:'https://example.com/careers/fs1'},{title:'Backend Developer',company:'Acme Tech',location:'Hyderabad',skills:['python','sql','docker','git'],minCgpa:6.5,branches:['CSE','IT'],gradYears:[2026],deadline:'2027-12-31',url:'dup'},{title:'Old QA Role',company:'LegacyCo',location:'Pune',skills:['java'],minCgpa:6,branches:[],gradYears:[2026],deadline:'2020-01-01',url:'https://example.com/old'}];
const ingest=()=>{if(db.paused)return log('automation','Paused: discovery skipped');FEED.forEach(r=>addJob(r,'sample-feed'));};
cron.schedule('*/5 * * * *',async()=>{if(db.paused)return;ingest();for(const j of db.jobs.filter(x=>x.status==='active'))await processJob(j);}); // also retries failed emails
const tok=new Map();
const auth=roles=>(q,r,n)=>{const u=tok.get((q.headers.authorization||'').replace('Bearer ',''));if(!u||(roles&&!roles.includes(u.role)))return r.status(401).json({error:'Unauthorized'});q.user=u;n();};
app.post('/api/login',(q,r)=>{const u=db.users.find(x=>x.email===String(q.body.email).toLowerCase()&&x.pw===hash(String(q.body.password)));if(!u)return r.status(401).json({error:'Invalid credentials'});const t=id()+id();tok.set(t,u);r.json({token:t,role:u.role,name:u.name});});
app.post('/api/register',(q,r)=>{const b=q.body;if(!b.email||!/^\S+@\S+\.\S+$/.test(b.email)||!b.password||b.password.length<6||!b.name)return r.status(400).json({error:'Name, valid email and 6+ char password required'});
 if(db.users.some(u=>u.email===b.email.toLowerCase()))return r.status(400).json({error:'Email already registered'});
 const s={id:id(),name:b.name,email:b.email.toLowerCase(),branch:'CSE',gradYear:2026,cgpa:0,skills:[],locations:[],interests:[],projects:[],portfolio:'',consent:{alerts:false,share:false}};
 db.students.push(s);db.users.push({id:id(),email:s.email,pw:hash(b.password),role:'student',name:s.name,sid:s.id});save();r.json({ok:true});});
const mine=q=>db.students.find(s=>s.id===q.user.sid);
const arr=v=>Array.isArray(v)?v:String(v||'').split(',').map(x=>x.trim()).filter(Boolean);
app.get('/api/student',auth(['student']),(q,r)=>{const s=mine(q);const jobs=db.jobs.filter(j=>j.status==='active').map(j=>({job:j,...match(s,j)})).filter(x=>x.eligible).sort((a,b)=>b.score-a.score);
 const f=[s.name,s.cgpa,s.skills.length,s.projects.length,s.locations.length,s.interests.length,s.portfolio];r.json({student:s,completeness:Math.round(100*f.filter(Boolean).length/f.length),matches:jobs,emails:db.emails.filter(e=>e.studentId===s.id)});});
app.put('/api/student',auth(['student']),(q,r)=>{const s=mine(q),b=q.body,c=+b.cgpa;if(isNaN(c)||c<0||c>10)return r.status(400).json({error:'CGPA must be 0-10'});
 Object.assign(s,{name:b.name||s.name,branch:b.branch||s.branch,gradYear:+b.gradYear||s.gradYear,cgpa:c,locations:arr(b.locations),interests:arr(b.interests),projects:arr(b.projects),portfolio:b.portfolio||'',skills:[...new Set([...arr(b.skills).map(x=>x.toLowerCase()),...extract(b.resumeText)])]});
 if(b.consent)s.consent={alerts:!!b.consent.alerts,share:!!b.consent.share};log('profile',`Profile updated (student ${s.id})`);save();bus.emit('student.updated',s);r.json({ok:true,skills:s.skills});});
app.get('/unsubscribe/:sid',(q,r)=>{const s=db.students.find(x=>x.id===q.params.sid);if(s){s.consent.alerts=false;log('optout',`Unsubscribed student ${s.id}`);}r.send('You have been unsubscribed from job alerts.');});
app.get('/api/jobs',auth(),(q,r)=>r.json(q.user.role==='recruiter'?db.jobs.filter(j=>j.company===q.user.company):db.jobs));
app.post('/api/jobs',auth(['recruiter','admin']),(q,r)=>{const b=q.body;if(!b.title||!b.url||!/^https?:\/\//.test(b.url))return r.status(400).json({error:'Title and http(s) application URL required'});
 const res=addJob({title:b.title,company:q.user.company||b.company||'Unknown',location:b.location||'Remote',skills:arr(b.skills),minCgpa:b.minCgpa,branches:arr(b.branches),gradYears:arr(b.gradYears||2026),deadline:b.deadline||'2027-12-31',url:b.url,recruiterEmail:q.user.role==='recruiter'?q.user.email:b.recruiterEmail},'recruiter-portal');r.json(res.dup?{error:'Duplicate job'}:{ok:true});});
app.get('/api/recruiter',auth(['recruiter']),(q,r)=>r.json(db.jobs.filter(j=>j.company===q.user.company).map(j=>({job:j,shortlist:db.students.filter(s=>s.consent.share).map(s=>({s,m:match(s,j)})).filter(x=>x.m.eligible&&x.m.score>=50).sort((a,b)=>b.m.score-a.m.score).map(({s,m})=>({name:s.name,branch:s.branch,cgpa:s.cgpa,gradYear:s.gradYear,skills:s.skills,projects:s.projects,portfolio:s.portfolio,score:m.score})),emails:db.emails.filter(e=>e.jobId===j.id&&e.kind==='recruiter')}))));
app.get('/api/admin',auth(['admin']),(q,r)=>{let matches=0;db.jobs.filter(j=>j.status==='active').forEach(j=>db.students.forEach(s=>{const m=match(s,j);if(m.eligible&&m.score>=50)matches++;}));
 const E=db.emails;r.json({paused:db.paused,stats:{students:db.students.length,jobs:db.jobs.length,active:db.jobs.filter(j=>j.status==='active').length,expired:db.jobs.filter(j=>j.status==='expired').length,matches,sent:E.filter(e=>e.status==='sent').length,failed:E.filter(e=>e.status==='failed').length,recs:E.filter(e=>e.kind==='recruiter'&&e.status==='sent').length},logs:db.logs.slice(0,40),emails:E.slice(0,30),jobs:db.jobs});});
app.post('/api/admin/pause',auth(['admin']),(q,r)=>{db.paused=!!q.body.paused;log('automation',db.paused?'Automation PAUSED':'Automation resumed');r.json({paused:db.paused});if(!db.paused)ingest();});
app.post('/api/admin/ingest',auth(['admin']),(q,r)=>{ingest();r.json({ok:true});});
app.use(express.static(path.join(__dirname,'public')));
fs.mkdirSync(path.dirname(F),{recursive:true});
if(fs.existsSync(F))db=JSON.parse(fs.readFileSync(F));else seed();
app.listen(process.env.PORT||3000,()=>console.log('Running on '+base()));
