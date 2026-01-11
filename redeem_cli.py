"""
Polymarket Gasless Redeem CLI
A standalone command-line tool for automatically redeeming Polymarket positions.
"""

import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Get script directory
SCRIPT_DIR = Path(__file__).parent.absolute()
REDEMPTION_SCRIPT_PATH = SCRIPT_DIR / "src" / "redeem.ts"


def output(event: str, **data):
    """Output a JSON event to stdout."""
    msg = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": event,
        **data
    }
    print(json.dumps(msg), flush=True)


def load_env_file():
    """Load environment variables from .env file."""
    env_path = SCRIPT_DIR / ".env"
    if env_path.exists():
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                # Skip empty lines and comments
                if not line or line.startswith('#'):
                    continue
                # Parse KEY=VALUE format
                if '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip()
                    # Remove quotes if present
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    # Only set if not already in environment
                    if key and value and key not in os.environ:
                        os.environ[key] = value


class RedemptionCLI:
    """Command-line interface for Polymarket redemption service."""
    
    def __init__(self, interval_minutes: int = None, check_only: bool = False, password: str = None):
        """
        Initialize the redemption CLI.
        
        Args:
            interval_minutes: Interval in minutes for automatic redemption (None = one-time)
            check_only: If True, only check for redeemable positions without redeeming
            password: Encryption password for automated mode
        """
        self.interval_minutes = interval_minutes
        self.check_only = check_only
        self.password = password
        self._stop = asyncio.Event()
        self._task = None
        self._next_run_at = None
        self._last_run_at = None
    
    def _run_subprocess_sync(self, args: list) -> dict:
        """Run subprocess synchronously (called in a thread)."""
        try:
            # Build environment, adding password if available
            env = {**os.environ}
            if self.password:
                env['REDEEM_PASSWORD'] = self.password
            
            # On Windows, npx is a .cmd script and requires shell=True
            use_shell = sys.platform == "win32"
            
            result = subprocess.run(
                args,
                cwd=SCRIPT_DIR,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                env=env,
                timeout=115,
                shell=use_shell
            )
            return {
                "output": result.stdout + result.stderr,
                "returncode": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {
                "output": "Script timed out",
                "returncode": -1
            }
        except Exception as e:
            return {
                "output": str(e),
                "returncode": -1
            }
    
    def _parse_output(self, raw_output: str) -> dict:
        """Parse script output and extract key information."""
        result = {
            "conditions": 0,
            "total_value": 0.0,
            "redeemed": 0,
            "transactions": []
        }
        
        lines = raw_output.strip().split("\n")
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Parse condition count
            if "condition(s) to redeem" in line:
                match = re.search(r"Found (\d+) condition", line)
                if match:
                    result["conditions"] = int(match.group(1))
            
            # Parse total value
            if "Total redeemable:" in line:
                match = re.search(r"\$([0-9.]+)", line)
                if match:
                    result["total_value"] = float(match.group(1))
            
            # Parse redemption results
            if "SUCCESS!" in line:
                match = re.search(r"Tx: (0x[a-fA-F0-9]+)", line)
                if match:
                    result["transactions"].append(match.group(1))
                    result["redeemed"] += 1
            
            # Parse completion
            if "Redemption complete!" in line:
                match = re.search(r"(\d+)/(\d+) successful", line)
                if match:
                    result["redeemed"] = int(match.group(1))
        
        return result
    
    async def _run_redemption(self) -> dict:
        """Execute the Node.js redemption script."""
        mode = "check" if self.check_only else "redeem"
        
        if not REDEMPTION_SCRIPT_PATH.exists():
            output("error", mode=mode, error="script_not_found", message=f"Redemption script not found at {REDEMPTION_SCRIPT_PATH}")
            return {"success": False, "error": "Script not found"}
        
        args = ["npx", "tsx", "src/redeem.ts"]
        if self.check_only:
            args.append("--check")
        
        output("start", mode=mode)
        
        try:
            result_data = await asyncio.wait_for(
                asyncio.to_thread(self._run_subprocess_sync, args),
                timeout=120
            )
            
            raw_output = result_data["output"]
            returncode = result_data["returncode"]
            
            # Parse results
            result = self._parse_output(raw_output)
            result["exit_code"] = returncode
            result["success"] = returncode == 0
            result["mode"] = mode
            result["raw_output"] = raw_output.strip()
            
            if result["success"]:
                output("result",
                    mode=mode,
                    success=True,
                    positions=result["conditions"],
                    total_value=result["total_value"],
                    redeemed=result["redeemed"],
                    transactions=result["transactions"]
                )
            else:
                output("error",
                    mode=mode,
                    success=False,
                    exit_code=returncode,
                    error="script_failed",
                    raw_output=raw_output.strip()
                )
            
            return result
            
        except asyncio.TimeoutError:
            output("error", mode=mode, error="timeout", message="Redemption script timed out")
            return {"success": False, "error": "Timeout"}
        except Exception as e:
            output("error", mode=mode, error="exception", message=str(e))
            return {"success": False, "error": str(e)}
    
    async def _run_loop(self):
        """Main loop that runs redemption periodically."""
        # Run immediately on start
        self._last_run_at = datetime.now(timezone.utc)
        await self._run_redemption()
        
        if self.interval_minutes is None:
            return
        
        # Then run every interval_minutes
        interval_seconds = self.interval_minutes * 60
        while not self._stop.is_set():
            try:
                # Set next run time
                self._next_run_at = datetime.now(timezone.utc) + timedelta(seconds=interval_seconds)
                output("scheduled", next_run=self._next_run_at.isoformat(), interval_minutes=self.interval_minutes)
                
                await asyncio.sleep(interval_seconds)
                
                if not self._stop.is_set():
                    self._last_run_at = datetime.now(timezone.utc)
                    await self._run_redemption()
            except asyncio.CancelledError:
                break
            except Exception as e:
                output("error", error="loop_error", message=str(e))
                # Wait a minute before retrying
                await asyncio.sleep(60)
    
    async def start(self):
        """Start the redemption service."""
        if self.interval_minutes is None:
            # One-time execution
            await self._run_redemption()
        else:
            # Continuous loop
            self._stop.clear()
            self._task = asyncio.create_task(self._run_loop())
            output("started", mode="continuous", interval_minutes=self.interval_minutes)
            try:
                await self._task
            except asyncio.CancelledError:
                pass
    
    async def stop(self):
        """Stop the redemption service."""
        self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        output("stopped")


def check_key_setup():
    """Check if encrypted keys have been set up."""
    key_file = SCRIPT_DIR / ".encrypted_keys"
    if not key_file.exists():
        output("error", error="keys_not_configured", message="Encrypted keys not configured. Run: npx tsx src/redeem.ts --setup")
        sys.exit(1)


def prompt_password() -> str:
    """Prompt user for encryption password."""
    import getpass
    try:
        # Password prompt goes to stderr so it doesn't mix with JSON output
        print("Enter encryption password: ", file=sys.stderr, end="", flush=True)
        password = getpass.getpass("")
        return password
    except (KeyboardInterrupt, EOFError):
        output("cancelled")
        sys.exit(0)


def main():
    """Main entry point."""
    # Load .env file before parsing arguments
    load_env_file()
    
    parser = argparse.ArgumentParser(
        description="Polymarket Gasless Redeem CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # One-time redemption
  python redeem_cli.py --once

  # One-time check (no redemption)
  python redeem_cli.py --check

  # Automatic redemption every 15 minutes
  python redeem_cli.py --interval 15

  # Automatic redemption every hour
  python redeem_cli.py --interval 60

Setup:
  Before first use, run: npx tsx src/redeem.ts --setup
  This securely stores your wallet credentials with encryption.

For more information, see README.md
        """
    )
    
    parser.add_argument(
        "--interval",
        type=int,
        metavar="MINUTES",
        help="Run redemption automatically every N minutes (e.g., --interval 15)"
    )
    
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run redemption once and exit (default if --interval not specified)"
    )
    
    parser.add_argument(
        "--check",
        action="store_true",
        help="Only check for redeemable positions, don't actually redeem"
    )
    
    args = parser.parse_args()
    
    # Determine mode
    if args.interval is not None:
        if args.interval < 1:
            output("error", error="invalid_interval", message="Interval must be at least 1 minute")
            sys.exit(1)
        interval_minutes = args.interval
    else:
        interval_minutes = None
    
    # Check key setup
    check_key_setup()
    
    # Check if Node.js is available
    try:
        result = subprocess.run(
            ["node", "--version"],
            capture_output=True,
            text=True,
            timeout=5,
            shell=(sys.platform == "win32")
        )
        if result.returncode != 0:
            raise FileNotFoundError
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        output("error", error="node_not_found", message="Node.js is not installed or not in PATH")
        sys.exit(1)
    
    # Check if redeem.ts exists
    if not REDEMPTION_SCRIPT_PATH.exists():
        output("error", error="script_not_found", message=f"Redemption script not found at {REDEMPTION_SCRIPT_PATH}")
        sys.exit(1)
    
    # Prompt for password (required for automated operation)
    # Check environment first, then prompt
    password = os.environ.get('REDEEM_PASSWORD')
    if not password:
        password = prompt_password()
    
    # Create and run CLI
    cli = RedemptionCLI(
        interval_minutes=interval_minutes,
        check_only=args.check,
        password=password
    )
    
    try:
        asyncio.run(cli.start())
    except KeyboardInterrupt:
        output("interrupted")
        asyncio.run(cli.stop())


if __name__ == "__main__":
    main()
