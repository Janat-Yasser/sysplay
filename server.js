require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const fs = require('fs');

const app = express();

// Ensure data dir exists for KV store
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/',            require('./routes/index'));
app.use('/compression', require('./routes/compression'));
app.use('/database',    require('./routes/database'));
app.use('/network',     require('./routes/network'));

app.use((req, res) => {
  res.status(404).render('404', { title: '404 — Systems Playground' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Systems Playground running -> http://localhost:${PORT}`));
