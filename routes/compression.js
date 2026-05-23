// compression.js
const express = require('express');
const r = express.Router();
const { compression } = require('../models/controllers');
r.get('/',        compression.getPage);
r.post('/',       compression.postCompress);
r.post('/api',    compression.apiCompress);
module.exports = r;
