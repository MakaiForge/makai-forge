from setuptools import setup, find_packages

setup(
    name="engine",
    version="1.0.0",
    description="Makai Runner — Unified Linux Wine Game Launcher",
    packages=find_packages(where="."),
    include_package_data=True,
)
