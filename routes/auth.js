const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

const signToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '90d'
    });
};

// Registration
router.post('/register', async (req, res) => {
    try {
        const { name, age, email, password } = req.body;
        
        User.create({ name, age, email, password }, (err, user) => {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({
                        status: 'error',
                        message: 'Email already exists'
                    });
                }
                return res.status(400).json({
                    status: 'error',
                    message: err.message
                });
            }

            const token = signToken(user.id);
            
            res.status(201).json({
                status: 'success',
                token,
                data: {
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        age: user.age,
                        subscription: user.subscription
                    }
                }
            });
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                status: 'error',
                message: 'Please provide email and password'
            });
        }
        
        User.findByEmail(email, async (err, user) => {
            if (err || !user) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Incorrect email or password'
                });
            }
            
            User.comparePassword(password, user.password, (err, isMatch) => {
                if (err || !isMatch) {
                    return res.status(401).json({
                        status: 'error',
                        message: 'Incorrect email or password'
                    });
                }
                
                const token = signToken(user.id);
                
                res.json({
                    status: 'success',
                    token,
                    data: {
                        user: {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            age: user.age,
                            subscription: user.subscription,
                            searchesThisWeek: user.searchesThisWeek
                        }
                    }
                });
            });
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
});

module.exports = router;