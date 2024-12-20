import amqp from 'amqplib';
import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';

const prisma = new PrismaClient();
console.log("worker running...");
(async () => {

  try {
    const connection = await amqp.connect(process.env.QUEUE_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue('codeQueue');

    channel.consume('codeQueue', async (message) => {
      if (!message) return;

      const { submissionId, questionId, language, code } = JSON.parse(message.content.toString());

      try {
        const question = await prisma.question.findUnique({
          where: { id: questionId },
          include: { testCases: true },
        });

        if (!question) {
          console.error(`Question with ID ${questionId} not found`);
          return channel.ack(message);
        }

        let status = 'SUCCESS';

        for (const testCase of question.testCases) {
          const result = await executeCode(language, code, testCase.input);
          if (result !== testCase.expected) {
            status = 'FAILURE';
            break;
          }
        }

        await prisma.submission.update({
          where: { id: submissionId },
          data: { status },
        });
      } catch (error) {
        console.error('Error processing message:', error);
      }

      channel.ack(message);
    });
  } catch (error) {
    console.error('Error initializing RabbitMQ or Prisma:', error);
  }
})();

const executeCode = (language, code, input) => {
  return new Promise((resolve) => {
    // Save code and input to files, then execute in a Docker container
    const command = `docker run --rm -v $(pwd):/app sandbox-${language} /app/code`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Execution error:', stderr);
        resolve(stderr.trim());
      } else {
        resolve(stdout.trim());
      }
    });
  });
};
