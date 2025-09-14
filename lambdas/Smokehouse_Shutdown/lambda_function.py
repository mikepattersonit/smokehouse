import boto3

iot_client = boto3.client('iot', region_name='us-east-2')

def lambda_handler(event, context):
    print(f"Received event for shutdown: {event}")

    # Example: Disable IoT Rule (if needed)
    try:
        iot_client.update_topic_rule(
            ruleName='wake-up-rule',
            ruleDisabled=True
        )
        print("IoT Rule disabled.")
    except Exception as e:
        print(f"Error disabling IoT Rule: {e}")

    # Log shutdown or notify via Amplify
    amplify_client = boto3.client('amplify', region_name='us-east-2')
    print("Amplify resources remain accessible.")

    return {
        'statusCode': 200,
        'body': 'Shutdown executed successfully.'
    }
