const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// static frontend and uploads
app.use(express.static(path.join(__dirname)));

// ensure data folder and files
const dataDir = path.join(__dirname, 'data');
if(!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const customFile = path.join(dataDir, 'custom.json');
if(!fs.existsSync(customFile)) fs.writeFileSync(customFile, '[]');

// uploads folder
const uploadsDir = path.join(__dirname, 'uploads');
if(!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// multer storage and basic limits + file type check
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadsDir); },
  filename: function (req, file, cb) {
    const safe = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-\_]/g,'_');
    cb(null, safe);
  }
});

// admin token (optional) - set ADMIN_TOKEN environment variable to require it
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || null;
function checkAuth(req, res, next){
  if(!ADMIN_TOKEN) return next(); // no auth configured
  const token = req.headers['x-admin-token'] || req.query['admin_token'];
  if(token !== ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  return next();
}

const fileFilter = function(req, file, cb){
  try{
    if(file.mimetype && (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/'))) return cb(null, true);
    return cb(new Error('Invalid file type'));
  }catch(e){ return cb(new Error('Invalid file type')); }
};

const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 }, fileFilter });

// upload endpoint for files (images/videos)
app.post('/upload', checkAuth, upload.single('file'), (req, res) => {
  if(!req.file) return res.status(400).json({ error: 'no file' });
  const url = `/uploads/${req.file.filename}`;
  return res.json({ url, filename: req.file.filename });
});

// API: list embedded + custom (frontend already has embedded JSON), but provide custom management
app.get('/api/custom', (req, res) => {
  try{
    const raw = fs.readFileSync(customFile,'utf8');
    const arr = JSON.parse(raw || '[]');
    res.json(arr);
  }catch(e){ res.status(500).json({error:'read error'}); }
});

app.post('/api/custom', checkAuth, (req, res) => {
  try{
    const items = JSON.parse(fs.readFileSync(customFile,'utf8') || '[]');
    const incoming = req.body;
    if(!incoming) return res.status(400).json({ error: 'no body' });
    // if id present, edit; else add
    if(incoming.id){
      const idx = items.findIndex(x=>String(x.id)===String(incoming.id));
      if(idx !== -1){ items[idx] = incoming; }
      else items.push(incoming);
    } else {
      // assign id
      const max = items.reduce((m,a)=>Math.max(m, Number(a.id)||0), 0);
      incoming.id = max + 1;
      items.push(incoming);
    }
    fs.writeFileSync(customFile, JSON.stringify(items, null, 2));
    res.json(incoming);
  }catch(e){ res.status(500).json({ error: 'write error' }); }
});

app.delete('/api/custom/:id', checkAuth, (req, res) => {
  try{
    const id = String(req.params.id);
    const items = JSON.parse(fs.readFileSync(customFile,'utf8') || '[]');
    const filtered = items.filter(x=>String(x.id)!==id);
    fs.writeFileSync(customFile, JSON.stringify(filtered, null, 2));
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error: 'delete error' }); }
});

// serve uploads
app.use('/uploads', express.static(uploadsDir));

app.listen(PORT, ()=>{
  console.log(`MyWorld server listening on http://localhost:${PORT}`);
});
