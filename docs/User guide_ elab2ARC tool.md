# User guide: elab2ARC tool

## Tool webpage: 
https://nfdi4plants.github.io/elab2arc/

## Setting up elabFTW API key

1. Log in to your eLabFTW instance
2. Go to User Settings 
![](https://pad.hhu.de/uploads/80c36be7-01b2-4043-8519-cef39fd2f50a.png)
3. Go to API Keys Tab and create a new key by giving it a name and **Read Only** permissions
 ![](https://pad.hhu.de/uploads/45147773-0836-4386-bd92-0490162312f0.png)
4. Copy key somewhere, because it will only displayed ones
 ![](https://pad.hhu.de/uploads/daf2a295-5d6b-4a5b-88d3-7091b057de09.png)

## Setting up DataHUB project access token

1. Log in into DataHUB and open your Project (ARC)
2. In Project go to Settings and Access tokens 
![](https://pad.hhu.de/uploads/2611859c-a191-4956-b1e3-8d4eb688f007.png)
3. Add a new project access token
![](https://pad.hhu.de/uploads/948c9e94-30d5-4cfe-b321-abfc2b95f610.png)
4. Create a token with a token name and expiration date. Select a **Maintainer** role and give **read_repository** and **write_repository** permissions
![](https://pad.hhu.de/uploads/856972e1-fcd3-44b9-aa18-af72d5a24571.png)
4. Copy token to somewhere, because it will be only displayed ones
![](https://pad.hhu.de/uploads/700788e5-0449-4ffc-8722-57290260a46d.png)

## Modify eLabFTW Experiment
1. Select your elabFTW experiment which you want to convert and go to edit mode 
2. Add an extra field to your elabFTW experiment (bottom)
 ![](https://pad.hhu.de/uploads/96e1f4b9-b30b-4886-8a86-6721b02a7580.png)
3. Use fielt type **URL** and as name **datahub_url** and add the **URL of your ARC** in the DataHUB as the default value
![](https://pad.hhu.de/uploads/83b40354-3531-475a-9399-ef2eb3493c51.png)

## Use elab2ARC tool
1. Select your elabFTW instance
2. Paste elabFTW API key
3. Paste DataHUB Access Token
![](https://pad.hhu.de/uploads/9e7c4d15-c64c-4024-bce4-dd157d9133f8.png)
4. Enter elabFTW Experiment ID found in the experiment settings. **Make sure you have added the DataHUB URL as an extra field first (see section above).**
![](https://pad.hhu.de/uploads/fb3304f4-b4bb-4d05-90de-6ee2f9f2dc59.png)
5. Press **One Click Submission** Button

### Tool should 
o	create a new assay folder with elabFTW experiment name as assay name
o	create the ARC folder structure (dataset/ protocols/ isa.assay)
o	convert experiment main text as protocol file in protocols
o	add experiment attachments in dataset folder
o	enter your name/email/affiliation in the isa.assay sheet








