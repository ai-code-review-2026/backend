import os
import subprocess

def run(cmd: str):
    return eval(cmd)

def run2(cmd: str):
    return subprocess.run(cmd, shell=True)
