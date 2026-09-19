window.HANDOFF_REPLAY = Object.freeze({
  "cases": {
    "clean": {
      "after": [
        {
          "closed_items": 0,
          "event_count": 0,
          "items": [],
          "open_items": 0
        },
        {
          "closed_items": 0,
          "event_count": 1,
          "items": [
            {
              "event_count": 1,
              "item_id": "arcade-cache",
              "last_minute": 7,
              "state": "open"
            }
          ],
          "open_items": 1
        },
        {
          "closed_items": 0,
          "event_count": 2,
          "items": [
            {
              "event_count": 1,
              "item_id": "arcade-cache",
              "last_minute": 7,
              "state": "open"
            },
            {
              "event_count": 1,
              "item_id": "arcade-input",
              "last_minute": 11,
              "state": "open"
            }
          ],
          "open_items": 2
        },
        {
          "closed_items": 1,
          "event_count": 3,
          "items": [
            {
              "event_count": 2,
              "item_id": "arcade-cache",
              "last_minute": 19,
              "state": "closed"
            },
            {
              "event_count": 1,
              "item_id": "arcade-input",
              "last_minute": 11,
              "state": "open"
            }
          ],
          "open_items": 1
        }
      ],
      "before": [
        {
          "closed_items": 0,
          "event_count": 0,
          "items": [],
          "open_items": 0
        },
        {
          "closed_items": 0,
          "event_count": 1,
          "items": [
            {
              "event_count": 1,
              "item_id": "arcade-cache",
              "last_minute": 7,
              "state": "open"
            }
          ],
          "open_items": 1
        },
        {
          "closed_items": 0,
          "event_count": 2,
          "items": [
            {
              "event_count": 1,
              "item_id": "arcade-cache",
              "last_minute": 7,
              "state": "open"
            },
            {
              "event_count": 1,
              "item_id": "arcade-input",
              "last_minute": 11,
              "state": "open"
            }
          ],
          "open_items": 2
        },
        {
          "closed_items": 1,
          "event_count": 3,
          "items": [
            {
              "event_count": 2,
              "item_id": "arcade-cache",
              "last_minute": 19,
              "state": "closed"
            },
            {
              "event_count": 1,
              "item_id": "arcade-input",
              "last_minute": 11,
              "state": "open"
            }
          ],
          "open_items": 1
        }
      ],
      "expected": {
        "closed_items": 1,
        "event_count": 3,
        "items": [
          {
            "event_count": 2,
            "item_id": "arcade-cache",
            "last_minute": 19,
            "state": "closed"
          },
          {
            "event_count": 1,
            "item_id": "arcade-input",
            "last_minute": 11,
            "state": "open"
          }
        ],
        "open_items": 1
      },
      "input_sha256": "0af0e109cda8b97681a3f74dfed464761bc42ef2d118ce44f1c36a544d6654bf",
      "records": [
        {
          "action": "open",
          "at_minute": 7,
          "classification": "SYNTHETIC",
          "event_id": "receipt-cache-open",
          "item_id": "arcade-cache"
        },
        {
          "action": "open",
          "at_minute": 11,
          "classification": "SYNTHETIC",
          "event_id": "receipt-input-open",
          "item_id": "arcade-input"
        },
        {
          "action": "close",
          "at_minute": 19,
          "classification": "SYNTHETIC",
          "event_id": "receipt-cache-close",
          "item_id": "arcade-cache"
        }
      ]
    },
    "duplicate": {
      "after": [
        {
          "closed_items": 0,
          "event_count": 0,
          "items": [],
          "open_items": 0
        },
        {
          "closed_items": 0,
          "event_count": 1,
          "items": [
            {
              "event_count": 1,
              "item_id": "arcade-cache",
              "last_minute": 7,
              "state": "open"
            }
          ],
          "open_items": 1
        },
        {
          "closed_items": 0,
          "event_count": 1,
          "items": [
            {
              "event_count": 1,
              "item_id": "arcade-cache",
              "last_minute": 7,
              "state": "open"
            }
          ],
          "open_items": 1
        },
        {
          "closed_items": 1,
          "event_count": 2,
          "items": [
            {
              "event_count": 2,
              "item_id": "arcade-cache",
              "last_minute": 19,
              "state": "closed"
            }
          ],
          "open_items": 0
        },
        {
          "closed_items": 1,
          "event_count": 3,
          "items": [
            {
              "event_count": 2,
              "item_id": "arcade-cache",
              "last_minute": 19,
              "state": "closed"
            },
            {
              "event_count": 1,
              "item_id": "arcade-input",
              "last_minute": 11,
              "state": "open"
            }
          ],
          "open_items": 1
        }
      ],
      "before": [
        {
          "closed_items": 0,
          "event_count": 0,
          "items": [],
          "open_items": 0
        },
        {
          "closed_items": 0,
          "event_count": 1,
          "items": [
            {
              "event_count": 1,
              "item_id": "arcade-cache",
              "last_minute": 7,
              "state": "open"
            }
          ],
          "open_items": 1
        },
        {
          "closed_items": 0,
          "event_count": 2,
          "items": [
            {
              "event_count": 2,
              "item_id": "arcade-cache",
              "last_minute": 7,
              "state": "open"
            }
          ],
          "open_items": 1
        },
        {
          "closed_items": 1,
          "event_count": 3,
          "items": [
            {
              "event_count": 3,
              "item_id": "arcade-cache",
              "last_minute": 19,
              "state": "closed"
            }
          ],
          "open_items": 0
        },
        {
          "closed_items": 1,
          "event_count": 4,
          "items": [
            {
              "event_count": 3,
              "item_id": "arcade-cache",
              "last_minute": 19,
              "state": "closed"
            },
            {
              "event_count": 1,
              "item_id": "arcade-input",
              "last_minute": 11,
              "state": "open"
            }
          ],
          "open_items": 1
        }
      ],
      "expected": {
        "closed_items": 1,
        "event_count": 3,
        "items": [
          {
            "event_count": 2,
            "item_id": "arcade-cache",
            "last_minute": 19,
            "state": "closed"
          },
          {
            "event_count": 1,
            "item_id": "arcade-input",
            "last_minute": 11,
            "state": "open"
          }
        ],
        "open_items": 1
      },
      "input_sha256": "ca1f5c0591cfe5dc4c7b2d713f4efe4e58a6cf58270683d84f2bd4248048b040",
      "records": [
        {
          "action": "open",
          "at_minute": 7,
          "classification": "SYNTHETIC",
          "event_id": "receipt-cache-open",
          "item_id": "arcade-cache"
        },
        {
          "action": "open",
          "at_minute": 7,
          "classification": "SYNTHETIC",
          "event_id": "receipt-cache-open",
          "item_id": "arcade-cache"
        },
        {
          "action": "close",
          "at_minute": 19,
          "classification": "SYNTHETIC",
          "event_id": "receipt-cache-close",
          "item_id": "arcade-cache"
        },
        {
          "action": "open",
          "at_minute": 11,
          "classification": "SYNTHETIC",
          "event_id": "receipt-input-open",
          "item_id": "arcade-input"
        }
      ]
    },
    "out-of-order": {
      "after": [
        {
          "closed_items": 0,
          "event_count": 0,
          "items": [],
          "open_items": 0
        },
        {
          "closed_items": 1,
          "event_count": 1,
          "items": [
            {
              "event_count": 1,
              "item_id": "arcade-cache",
              "last_minute": 19,
              "state": "closed"
            }
          ],
          "open_items": 0
        },
        {
          "closed_items": 1,
          "event_count": 2,
          "items": [
            {
              "event_count": 1,
              "item_id": "arcade-cache",
              "last_minute": 19,
              "state": "closed"
            },
            {
              "event_count": 1,
              "item_id": "arcade-input",
              "last_minute": 11,
              "state": "open"
            }
          ],
          "open_items": 1
        },
        {
          "closed_items": 1,
          "event_count": 3,
          "items": [
            {
              "event_count": 2,
              "item_id": "arcade-cache",
              "last_minute": 19,
              "state": "closed"
            },
            {
              "event_count": 1,
              "item_id": "arcade-input",
              "last_minute": 11,
              "state": "open"
            }
          ],
          "open_items": 1
        }
      ],
      "before": [
        {
          "closed_items": 0,
          "event_count": 0,
          "items": [],
          "open_items": 0
        },
        {
          "closed_items": 1,
          "event_count": 1,
          "items": [
            {
              "event_count": 1,
              "item_id": "arcade-cache",
              "last_minute": 19,
              "state": "closed"
            }
          ],
          "open_items": 0
        },
        {
          "closed_items": 1,
          "event_count": 2,
          "items": [
            {
              "event_count": 1,
              "item_id": "arcade-cache",
              "last_minute": 19,
              "state": "closed"
            },
            {
              "event_count": 1,
              "item_id": "arcade-input",
              "last_minute": 11,
              "state": "open"
            }
          ],
          "open_items": 1
        },
        {
          "closed_items": 1,
          "event_count": 3,
          "items": [
            {
              "event_count": 2,
              "item_id": "arcade-cache",
              "last_minute": 19,
              "state": "closed"
            },
            {
              "event_count": 1,
              "item_id": "arcade-input",
              "last_minute": 11,
              "state": "open"
            }
          ],
          "open_items": 1
        }
      ],
      "expected": {
        "closed_items": 1,
        "event_count": 3,
        "items": [
          {
            "event_count": 2,
            "item_id": "arcade-cache",
            "last_minute": 19,
            "state": "closed"
          },
          {
            "event_count": 1,
            "item_id": "arcade-input",
            "last_minute": 11,
            "state": "open"
          }
        ],
        "open_items": 1
      },
      "input_sha256": "02a242cbcf4b0b7dab25ed13e9c2b0f03acf090377c2a3d7e6cc7f08226ace6c",
      "records": [
        {
          "action": "close",
          "at_minute": 19,
          "classification": "SYNTHETIC",
          "event_id": "receipt-cache-close",
          "item_id": "arcade-cache"
        },
        {
          "action": "open",
          "at_minute": 11,
          "classification": "SYNTHETIC",
          "event_id": "receipt-input-open",
          "item_id": "arcade-input"
        },
        {
          "action": "open",
          "at_minute": 7,
          "classification": "SYNTHETIC",
          "event_id": "receipt-cache-open",
          "item_id": "arcade-cache"
        }
      ]
    }
  },
  "classification": "SYNTHETIC",
  "evidence_kind": "redacted-derived-historical-records",
  "historical_continuation": "One separate Astra continuation performed the original repair; private invocation metadata is withheld.",
  "historical_fix_commit": "849660c39cd53277f37ba3dddf8f7ccd553cf910",
  "historical_midpoint_commit": "97dac1b6bdcfcfbae5ebdb43bbfdc0854335030e",
  "maintenance": {
    "classification": "SYNTHETIC",
    "input_records": 4,
    "input_sha256": "ca1f5c0591cfe5dc4c7b2d713f4efe4e58a6cf58270683d84f2bd4248048b040",
    "open_queue": [
      "arcade-input"
    ],
    "release_authority": false,
    "replayed_records": 1,
    "schema": "pocket-arcade-maintenance/1",
    "scope": "offline-fictional-maintenance",
    "summary": {
      "closed_items": 1,
      "event_count": 3,
      "items": [
        {
          "event_count": 2,
          "item_id": "arcade-cache",
          "last_minute": 19,
          "state": "closed"
        },
        {
          "event_count": 1,
          "item_id": "arcade-input",
          "last_minute": 11,
          "state": "open"
        }
      ],
      "open_items": 1
    }
  },
  "missing": [
    "No earlier conversation, hidden decisions, or original author's reasoning beyond the project artifacts.",
    "No access to, or independent re-verification of, the original downloaded archive and inert source files described by provenance.json.",
    "No real-world input sample, upstream test execution, human review, browser validation, or permission to publish.",
    "No claim that this bounded ll-duplicate repair completes the seed's full two-defect release gate."
  ],
  "mode": "recorded-python-execution-not-browser-python",
  "public_reverification_limit": "The underlying private invocation and its identity cannot be independently reverified from this public projection.",
  "recovered": [
    "The frozen midpoint intentionally fails the duplicate desired-behavior case: four records are counted as four events rather than three.",
    "ACCEPTANCE.json fixes global and per-item uniqueness by event ID, complete validation and conflict rejection, chronological ordering with event-ID ties, immutability, and bounded synthetic JSONL.",
    "The clean and out-of-order cases already pass. The existing equal-minute, conflict, bounds, validation, and immutable-value behavior must remain intact.",
    "_checked_order already builds and validates an event-ID map, but then sorts the original receipts rather than the map's unique values.",
    "parse_jsonl intentionally preserves raw validated records. maintenance_report computes replayed_records from raw length minus unique event_count, so deduplication belongs in the reducer rather than the parser.",
    "The three fictional fixtures, sealed failure evidence, and provenance account are immutable inputs, not real telemetry or independent attestation."
  ],
  "schema": "handoff-browser-replay/2"
});
