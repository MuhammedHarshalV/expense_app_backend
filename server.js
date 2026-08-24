const express = require('express');

const userRoutes = require('./routes/user_routes');
const { BASE_URL, PORT } = require('./config/config');
const app = express();


app.use(express.json());

app.use('/api/users', userRoutes);

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'API is running',
    });
});

app.listen(PORT, () => {
    console.log(`Server running at ${BASE_URL}`);
});