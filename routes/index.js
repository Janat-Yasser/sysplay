const express = require('express');
const router  = express.Router();
const { index } = require('../models/controllers');
router.get('/', index.getHome);
module.exports = router;
