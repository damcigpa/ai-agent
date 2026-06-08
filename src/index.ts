import "dotenv/config";
import * as readline from "readline";
import { chat } from "./agent.js";

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("Chat with Claude (type 'exit' to quit)");
  console.log("Model commands: 'use sonnet' | 'use haiku' (default: haiku)");
  console.log("Quiz: type /quiz after researching a topic\n");

  const askQuestion = () => {
    rl.question("You: ", async (input) => {
      const trimmed = input.trim();
      if (trimmed.toLowerCase() === "exit") {
        console.log("Bye!");
        rl.close();
        return;
      }
      if (trimmed) {
        const response = await chat(trimmed);
        // streaming responses print themselves via process.stdout.write
        // non-streaming responses (quiz, model switch) need to be printed here
        if (response && !response.includes("\n📚 Subject:")) {
          console.log(`\n${response}\n`);
        }
      }
      askQuestion();
    });
  };

  askQuestion();
}

main().catch(console.error);
