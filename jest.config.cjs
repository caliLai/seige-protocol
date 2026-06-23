module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  moduleNameMapper: {
    "^/(.*)$": "<rootDir>/$1",
  },
};
