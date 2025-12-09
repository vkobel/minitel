# API Setup

## Prerequisites

Install Bun on macOS:

```bash
brew install oven-sh/bun/bun
```

## Quick Start

```bash
# Install dependencies (from project root)
bun install

# Start the API
cd apps/api && bun run dev
```

The API will start on `http://localhost:4000`

## Examples

Health check:
```bash
curl http://localhost:4000/api/health
```

Decode a transaction:
```bash
curl -X POST http://localhost:4000/api/decode \
  -H "Content-Type: application/json" \
  -d '{
    "protocol": "solana",
    "rawTx": "03000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006dbed50bab859088ef95ffb620a15fc1c4f9ea9f44556228ac4ae92dc1e8c8e15dda2889ca7673bcc4315979054c12be054f010bbe58bc997bce8bb4f56ea8067724e2a41a80ceac49132ffb0f1f25c556793ebe8960bdbe72f9b76b78c154925de27908be04372754d4ef6b48f5e9f0c439ec336ed6e4b08e24169b063342050301080dc36b1a5da2e60d1fd5d3a6b46f7399eb26571457f3272f3c978bc9527ad2335f8061f75dde26f1edb86fad8ac324809a47a7bc8825d0a591286bc7135d8169eec8049a6d5db05491ef846800fa7afef819d9be2f67273bf551d5c779eb73999e0267c9719a63a3dd78d725164a88b0739d151afbec5c2c9cb0d8539389767ece06a7d51718c774c928566398691d5eb68b5eb8a39b4b6d5c73555b210000000000000000000000000000000000000000000000000000000000000000000000000306466fe5211732ffecadba72c39be7bc8ce5bbc5f7126b2c439b3a40000000ddf42a04800a54de2e583f94f17b089725b772d1333526271241532776d2ffc606a1d8179137542a983437bdfe2a7ab2557f535c8a78722b68a49dc00000000006a1d817a502050b680791e6ce6db88e1e5b7150f61fc6790a4eb4d10000000006a7d517192c568ee08a845f73d29788cf035c3145b21ab344d8062ea940000006a7d517192c5c51218cc94c3d4af17f58daee089ba1fd44e3dbd98a0000000006a7d517193584d0feed9bb3431d13206be544281b57b8566cc5375ff40000007819830bc88aff2b950d2e1faf0e6313096a32a1fe71f3f86d9758c333ea2555070503030a02040400000005020001340000000081d5220000000000c80000000000000006a1d8179137542a983437bdfe2a7ab2557f535c8a78722b68a49dc0000000000802010b7400000000c36b1a5da2e60d1fd5d3a6b46f7399eb26571457f3272f3c978bc9527ad2335fc36b1a5da2e60d1fd5d3a6b46f7399eb26571457f3272f3c978bc9527ad2335f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008060107040c0900040200000008040104000028010000000f66d21220ef2f2d89aa00d02d17cb05b6b7db8f29ac4778b18def0f0c394127000000000600050294d80000060009030000000000000000"
  }' | jq .
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100  5823  100  3948  100  1875   157k  76359 --:--:-- --:--:-- --:--:--  236k
{
  "protocol": "Solana",
  "decodedTransaction": {
    "signatures": [
      "",
      "3CGAVoGFK5kihpW3ECfpeT2azHS8LEnz7bJtGvqKRNA6ZpvpNQrf9DmBCjDqzRfhx2q6ZPRvz7dcLaD5R6zwpWds",
      "3PAHoRgwVCbLJGX1VoAmdfmiFwGx22ZuEDHqe9dyGKX2vqnMPU8yPdZNkUBGGrrGb9BQnF8jq5BpkivvZdxiCGw6"
    ],
    "feePayer": "E9qDxpwuPFeFB7vDdDibdCbWwHy867eYz3rV29bAevuC",
    "recentBlockhash": "95pVDsL92sDuj3rLUbkBnRBNxrZumWNvVmXYuxwvJWDJ",
    "instructions": [
      {
        "programId": "11111111111111111111111111111111",
        "type": "AdvanceNonceAccount",
        "data": {
          "noncePubkey": "APc6NusdKE4kit7ky3N15mKQQKAPtfC2k1DBiH4DPiV",
          "authorizedPubkey": "ETncRJhQoLbqtsPS3SubE57dpYh7WF6hiW54Hg48Zhc1"
        },
        "accounts": [
          {
            "pubkey": "APc6NusdKE4kit7ky3N15mKQQKAPtfC2k1DBiH4DPiV",
            "isSigner": false,
            "isWritable": true
          },
          {
            "pubkey": "SysvarRecentB1ockHashes11111111111111111111",
            "isSigner": false,
            "isWritable": false
          },
          {
            "pubkey": "ETncRJhQoLbqtsPS3SubE57dpYh7WF6hiW54Hg48Zhc1",
            "isSigner": true,
            "isWritable": false
          }
        ]
      },
      {
        "programId": "11111111111111111111111111111111",
        "type": "Create",
        "data": {
          "fromPubkey": "E9qDxpwuPFeFB7vDdDibdCbWwHy867eYz3rV29bAevuC",
          "newAccountPubkey": "9e9pyeeP1SqZMVgkA3H61ip5yytYiTbD9QGdqUrrXz8u",
          "lamports": 2282881,
          "space": 200,
          "programId": "Stake11111111111111111111111111111111111111"
        },
        "accounts": [
          {
            "pubkey": "E9qDxpwuPFeFB7vDdDibdCbWwHy867eYz3rV29bAevuC",
            "isSigner": true,
            "isWritable": true
          },
          {
            "pubkey": "9e9pyeeP1SqZMVgkA3H61ip5yytYiTbD9QGdqUrrXz8u",
            "isSigner": true,
            "isWritable": true
          }
        ]
      },
      {
        "programId": "Stake11111111111111111111111111111111111111",
        "type": "Initialize",
        "data": {
          "stakePubkey": "9e9pyeeP1SqZMVgkA3H61ip5yytYiTbD9QGdqUrrXz8u",
          "authorized": {
            "staker": "E9qDxpwuPFeFB7vDdDibdCbWwHy867eYz3rV29bAevuC",
            "withdrawer": "E9qDxpwuPFeFB7vDdDibdCbWwHy867eYz3rV29bAevuC"
          },
          "lockup": {
            "unixTimestamp": 0,
            "epoch": 0,
            "custodian": "11111111111111111111111111111111"
          }
        },
        "accounts": [
          {
            "pubkey": "9e9pyeeP1SqZMVgkA3H61ip5yytYiTbD9QGdqUrrXz8u",
            "isSigner": true,
            "isWritable": true
          },
          {
            "pubkey": "SysvarRent111111111111111111111111111111111",
            "isSigner": false,
            "isWritable": false
          }
        ]
      },
      {
        "programId": "Stake11111111111111111111111111111111111111",
        "type": "Delegate",
        "data": {
          "stakePubkey": "9e9pyeeP1SqZMVgkA3H61ip5yytYiTbD9QGdqUrrXz8u",
          "votePubkey": "FwR3PbjS5iyqzLiLugrBqKSa5EKZ4vK9SKs7eQXtT59f",
          "authorizedPubkey": "E9qDxpwuPFeFB7vDdDibdCbWwHy867eYz3rV29bAevuC"
        },
        "accounts": [
          {
            "pubkey": "9e9pyeeP1SqZMVgkA3H61ip5yytYiTbD9QGdqUrrXz8u",
            "isSigner": true,
            "isWritable": true
          },
          {
            "pubkey": "FwR3PbjS5iyqzLiLugrBqKSa5EKZ4vK9SKs7eQXtT59f",
            "isSigner": false,
            "isWritable": false
          },
          {
            "pubkey": "SysvarC1ock11111111111111111111111111111111",
            "isSigner": false,
            "isWritable": true
          },
          {
            "pubkey": "SysvarStakeHistory1111111111111111111111111",
            "isSigner": false,
            "isWritable": false
          },
          {
            "pubkey": "StakeConfig11111111111111111111111111111111",
            "isSigner": false,
            "isWritable": false
          },
          {
            "pubkey": "E9qDxpwuPFeFB7vDdDibdCbWwHy867eYz3rV29bAevuC",
            "isSigner": true,
            "isWritable": true
          }
        ]
      },
      {
        "programId": "Stake11111111111111111111111111111111111111",
        "type": "Authorize",
        "data": {
          "stakePubkey": "9e9pyeeP1SqZMVgkA3H61ip5yytYiTbD9QGdqUrrXz8u",
          "authorizedPubkey": "E9qDxpwuPFeFB7vDdDibdCbWwHy867eYz3rV29bAevuC",
          "newAuthorizedPubkey": "2383vwQjzVkYuyspGMKp65UyjdGfmd4ryBjB1SvCrucr",
          "stakeAuthorizationType": {
            "index": 0
          },
          "custodianPubkey": "E9qDxpwuPFeFB7vDdDibdCbWwHy867eYz3rV29bAevuC"
        },
        "accounts": [
          {
            "pubkey": "9e9pyeeP1SqZMVgkA3H61ip5yytYiTbD9QGdqUrrXz8u",
            "isSigner": true,
            "isWritable": true
          },
          {
            "pubkey": "SysvarC1ock11111111111111111111111111111111",
            "isSigner": false,
            "isWritable": true
          },
          {
            "pubkey": "E9qDxpwuPFeFB7vDdDibdCbWwHy867eYz3rV29bAevuC",
            "isSigner": true,
            "isWritable": true
          },
          {
            "pubkey": "E9qDxpwuPFeFB7vDdDibdCbWwHy867eYz3rV29bAevuC",
            "isSigner": true,
            "isWritable": true
          }
        ],
        "warning": "⚠️ This instruction modifies stake account authority"
      },
      {
        "programId": "ComputeBudget111111111111111111111111111111",
        "type": "SetComputeUnitLimit",
        "data": {
          "units": 55444
        },
        "accounts": []
      },
      {
        "programId": "ComputeBudget111111111111111111111111111111",
        "type": "SetComputeUnitPrice",
        "data": {
          "microLamports": 0
        },
        "accounts": []
      }
    ]
  },
  "hash": "77057fcd55d4df6066ba2484ab20da6727461d3895852faf5f10d9d48f5c97f4"
}
```
