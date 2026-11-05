// Copyright (c) 2026 Janat Yasser. All rights reserved.
const express = require('express');
const r = express.Router();
const { database } = require('../models/controllers');
r.get('/',     database.getPage);
r.post('/api', database.apiOperation);
module.exports = r;
