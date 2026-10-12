const express = require('express');
require('dotenv').config();
const swaggerUi = require('swagger-ui-express');

const openApiSpec = require('./docs/Openapi');
const authRoutes = require('./routes/databricks-auth.routes');
const genieChatRoutes = require('./routes/genie-chat.routes');
const databricksFunctionsRoutes = require('./routes/databricks-functions.routes');
const agentRoutingRoutes = require('./routes/agent-routing.routes');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API documentation
app.get('/api-docs.json', (req, res) => res.json(openApiSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

// Routes
app.use('/databricks', authRoutes);
app.use('/api/genie/chat', genieChatRoutes);
app.use('/api/databricks/functions', databricksFunctionsRoutes);
app.use('/api/agent', agentRoutingRoutes);

app.get('/', (req, res) => {
    return res.status(200).json({ message: 'Server is running' });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log(`API docs available at http://localhost:${port}/api-docs`);
});