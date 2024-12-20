import express from 'express';
import { PrismaClient } from '@prisma/client';
import amqp from 'amqplib';

import dotenv from 'dotenv';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
console.log("main-server running...");
console.log(process.env.DATABASE_URL)
app.get("/", (req,res)=>{
    res.send("Welcome");
})

let channel;

(async () => {
  try {
    const connection = await amqp.connect(process.env.QUEUE_URL);
    channel = await connection.createChannel();
    await channel.assertQueue('codeQueue');
  } catch (error) {
    console.error('Error connecting to message queue:', error);
  }
})();

app.use(express.json());

// Admin: Add Question
app.post('/api/questions', async (req, res) => {
  try {
    const { title, description, languages, testCases } = req.body;
    const question = await prisma.question.create({
      data: {
        title,
        description,
        languages,
        testCases: { create: testCases },
      },
    });
    res.status(201).json(question);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add question' });
  }
});

// User: Submit Code
app.post('/api/submissions', async (req, res) => {
    console.log("Submission started")
    
  try {
    const { questionId, language, code } = req.body;
    const submission = await prisma.submission.create({
      data: {
        questionId,
        language,
        code,
        status: 'PENDING',
      },
    });

    channel.sendToQueue(
      'codeQueue',
      Buffer.from(
        JSON.stringify({
          submissionId: submission.id,
          questionId,
          language,
          code,
        })
      )
    );

    res.status(201).json({ message: 'Code submitted successfully!', submissionId: submission.id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit code' });
  }
});

app.listen(4000, () => console.log('Main server running on port 4000'));
