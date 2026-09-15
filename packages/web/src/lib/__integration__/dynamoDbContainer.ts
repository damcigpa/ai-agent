// src/lib/__integration__/dynamoDbContainer.ts
import { GenericContainer, StartedTestContainer } from "testcontainers";
import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";

let container: StartedTestContainer;

export async function startDynamoDbLocal(): Promise<void> {
  container = await new GenericContainer("amazon/dynamodb-local:latest")
    .withExposedPorts(8000)
    .start();

  const port = container.getMappedPort(8000);
  process.env.DYNAMODB_ENDPOINT = `http://localhost:${port}`;
  process.env.AWS_ACCESS_KEY_ID = "fake";
  process.env.AWS_SECRET_ACCESS_KEY = "fake";
  process.env.AWS_REGION = "local";
}

export async function stopDynamoDbLocal(): Promise<void> {
  await container.stop();
}

function getRawClient(): DynamoDBClient {
  return new DynamoDBClient({
    region: "local",
    endpoint: process.env.DYNAMODB_ENDPOINT,
    credentials: { accessKeyId: "fake", secretAccessKey: "fake" },
  });
}

export async function createUsersTable(): Promise<void> {
  const client = getRawClient();
  await client.send(
    new CreateTableCommand({
      TableName: "Users",
      AttributeDefinitions: [
        { AttributeName: "userId", AttributeType: "S" },
        { AttributeName: "email", AttributeType: "S" },
      ],
      KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
      GlobalSecondaryIndexes: [
        {
          IndexName: "EmailIndex",
          KeySchema: [{ AttributeName: "email", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
          ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    })
  );
}

export async function dropUsersTable(): Promise<void> {
  const client = getRawClient();
  await client.send(new DeleteTableCommand({ TableName: "Users" }));
}