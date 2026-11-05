// Copyright (c) 2026 Janat Yasser. All rights reserved.
const express = require('express');
const r = express.Router();
const { network } = require('../models/controllers');
r.get('/', network.getPage);
module.exports = r;
