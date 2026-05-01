import "dotenv/config";
import * as readline from "readline";
import { chat } from "./agent.js";

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("Chat with Claude (type 'exit' to quit)\n");

  const askQuestion = () => {
    rl.question("You: ", async (input) => {
      const trimmed = input.trim();
      if (trimmed.toLowerCase() === "exit") {
        console.log("Bye!");
        rl.close();
        return;
      }
      if (trimmed) await chat(trimmed);
      askQuestion();
    });
  };

  askQuestion();
}

main().catch(console.error);
