import { createSchema, createYoga } from "graphql-yoga";
import { typeDefs } from "../../../graphql/schema";
import { resolvers } from "../../../graphql/resolvers";

const schema = createSchema({
  typeDefs,
  resolvers,
});

// createYoga returns a fetch-API-compatible handler — Next.js App Router
// route handlers speak this exact protocol natively, so this wiring is
// the entire integration; no adapter/glue code needed.
const { handleRequest } = createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Response },
});

export { handleRequest as GET, handleRequest as POST };
