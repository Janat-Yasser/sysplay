// Copyright (c) 2026 Janat Yasser. All rights reserved.
const express = require('express');
const router  = express.Router();
const { index } = require('../models/controllers');
router.get('/', index.getHome);
module.exports = router;
