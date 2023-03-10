#!/bin/bash

solana-test-validator --account MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac bin/mango-mint.json &
pid="$!"

# handle ctrl-c
trap cleanup INT EXIT KILL 2

cleanup()
{
    echo "cleanup $pid"
    kill -9 $pid
}

sleep 5

solana program deploy bin/mango.so -ul --program-id bin/mango.json
solana program deploy bin/serum_dex.so -ul --program-id bin/serum_dex.json
solana program deploy bin/pyth_mock.so -ul --program-id bin/pyth_mock.json

# idle waiting for abort
wait $pid
