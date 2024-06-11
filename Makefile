include .env
export

run-test:
	npm run test

sso:
	aws sso login
