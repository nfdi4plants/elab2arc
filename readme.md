# eLabFTW to ARC Converter

This project provides a tool for converting eLabFTW experiment data into ARC (Annotated Research Context) format. It allows researchers to easily fetch experiment data from eLabFTW instances and update or push these files to DataHUB in ARC format. The application streamlines the management of data from lab experiments to repositories, improving efficiency in scientific data handling.

![eLab2ARC jpg (1)](https://github.com/user-attachments/assets/ed6fac10-afcc-49f7-9475-f984395d7735)

## Features

- **Fetch eLabFTW Experiments:** Retrieve experiment data directly from an eLabFTW instance using the experiment ID and API key.
- **ARC Conversion:** Convert the fetched experiment data into ARC format, organizing protocols, datasets, and metadata.
- **DataHub Integration:** Push ARC files to a DataHub repository (supports automatic conversion and update of ARC files).
- **Supports Multiple eLabFTW Instances:** Choose between different eLabFTW instances like HHU or a custom URL.

## How to Use
A detailed user guide can be found here: [User Guide Document](https://github.com/nfdi4plants/elab2arc/blob/main/docs/User%20guide_%20elab2ARC%20tool.md)
1. **Setup:**
   - Ensure you have an eLabFTW account and a DataHub repository ready.
   - Obtain the API key from your eLabFTW account.

2. **Fetching Data:**
   - Input your eLabFTW Experiment ID and API key.
   - Click `Fetch eLabFTW` to retrieve your experiment data.

3. **Conversion:**
   - The tool will automatically convert your experiment data into ARC format.
   - The converted files include protocols and any associated datasets.

4. **DataHub Integration:**
   - After conversion, you can push your ARC files to your DataHUB repository.
   - The tool will ask for your DataHub access token to authenticate and submit the updated ARC files.


## Requirements

- An eLabFTW account with the necessary API access.
- A DataHub repository to store the ARC files.
- JavaScript-enabled browser to run the tool.

## Usage

[https://nfdi4plants.github.io/elab2arc/](https://nfdi4plants.github.io/elab2arc/)


## Dependencies

This project is built by ARCtrl, isomorphic-git, bootstrap.
Depends on API of eLabFTW and PLANTDataHUB

## Acknowledgments

This project was developed by Sabrina Zander and Xiaoran Zhou as part of the SFB1535 MibiNet and NFDI4Plants initiative to improve research data management for microbiome and plant sciences.


