import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import plotly.graph_objects as go
import plotly.express as px
from plotly.utils import PlotlyJSONEncoder
import json

@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def sales_analytics(request):
    """
    Generate comprehensive sales analytics
    """
    try:
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')
        group_by = request.GET.get('group_by', 'day')  # day, week, month
        
        # Default to last 30 days if no dates provided
        if not end_date:
            end_date = datetime.now().date()
        else:
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
            
        if not start_date:
            start_date = end_date - timedelta(days=30)
        else:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()

        # SQL query for sales data
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    DATE(s.created_at) as sale_date,
                    COUNT(s.id) as transaction_count,
                    SUM(s.total) as total_revenue,
                    SUM(s.subtotal) as subtotal,
                    SUM(s.tax_amount) as tax_amount,
                    AVG(s.total) as avg_transaction_value,
                    COUNT(DISTINCT s.customer_id) as unique_customers,
                    u.first_name || ' ' || u.last_name as salesperson,
                    s.payment_method
                FROM sales s
                LEFT JOIN users u ON s.user_id = u.id
                WHERE s.created_at >= %s AND s.created_at <= %s
                    AND s.payment_status = 'COMPLETED'
                GROUP BY DATE(s.created_at), u.id, s.payment_method
                ORDER BY sale_date DESC
            """, [start_date, end_date])
            
            sales_data = cursor.fetchall()
            
        # Convert to DataFrame for analysis
        df = pd.DataFrame(sales_data, columns=[
            'sale_date', 'transaction_count', 'total_revenue', 'subtotal',
            'tax_amount', 'avg_transaction_value', 'unique_customers',
            'salesperson', 'payment_method'
        ])
        
        if df.empty:
            return Response({
                'total_revenue': 0,
                'total_transactions': 0,
                'avg_transaction_value': 0,
                'growth_rate': 0,
                'charts': {},
                'top_performers': [],
                'payment_methods': []
            })

        # Aggregate metrics
        total_revenue = float(df['total_revenue'].sum())
        total_transactions = int(df['transaction_count'].sum())
        avg_transaction_value = float(df['avg_transaction_value'].mean())
        
        # Calculate growth rate (compare with previous period)
        period_days = (end_date - start_date).days
        prev_start = start_date - timedelta(days=period_days)
        prev_end = start_date
        
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT SUM(total) as prev_revenue
                FROM sales
                WHERE created_at >= %s AND created_at < %s
                    AND payment_status = 'COMPLETED'
            """, [prev_start, prev_end])
            
            prev_result = cursor.fetchone()
            prev_revenue = float(prev_result[0]) if prev_result[0] else 0
            
        growth_rate = ((total_revenue - prev_revenue) / prev_revenue * 100) if prev_revenue > 0 else 0

        # Group data by specified period
        df['sale_date'] = pd.to_datetime(df['sale_date'])
        
        if group_by == 'week':
            df['period'] = df['sale_date'].dt.strftime('%Y-W%U')
            period_format = 'Week %U, %Y'
        elif group_by == 'month':
            df['period'] = df['sale_date'].dt.strftime('%Y-%m')
            period_format = '%B %Y'
        else:  # day
            df['period'] = df['sale_date'].dt.strftime('%Y-%m-%d')
            period_format = '%Y-%m-%d'

        # Aggregate by period
        period_stats = df.groupby('period').agg({
            'total_revenue': 'sum',
            'transaction_count': 'sum',
            'unique_customers': 'sum'
        }).reset_index()

        # Create charts
        charts = {}
        
        # Revenue trend chart
        revenue_chart = go.Figure()
        revenue_chart.add_trace(go.Scatter(
            x=period_stats['period'],
            y=period_stats['total_revenue'],
            mode='lines+markers',
            name='Revenue',
            line=dict(color='#1976d2', width=3)
        ))
        revenue_chart.update_layout(
            title='Revenue Trend',
            xaxis_title='Period',
            yaxis_title='Revenue ($)',
            template='plotly_white'
        )
        charts['revenue_trend'] = json.loads(json.dumps(revenue_chart, cls=PlotlyJSONEncoder))

        # Transaction count chart
        transaction_chart = go.Figure()
        transaction_chart.add_trace(go.Bar(
            x=period_stats['period'],
            y=period_stats['transaction_count'],
            name='Transactions',
            marker_color='#4caf50'
        ))
        transaction_chart.update_layout(
            title='Transaction Count',
            xaxis_title='Period',
            yaxis_title='Number of Transactions',
            template='plotly_white'
        )
        charts['transaction_count'] = json.loads(json.dumps(transaction_chart, cls=PlotlyJSONEncoder))

        # Top performers
        top_performers = df.groupby('salesperson').agg({
            'total_revenue': 'sum',
            'transaction_count': 'sum'
        }).sort_values('total_revenue', ascending=False).head(10).to_dict('records')

        # Payment methods distribution
        payment_methods = df.groupby('payment_method')['total_revenue'].sum().to_dict()

        return Response({
            'total_revenue': total_revenue,
            'total_transactions': total_transactions,
            'avg_transaction_value': avg_transaction_value,
            'growth_rate': growth_rate,
            'charts': charts,
            'top_performers': top_performers,
            'payment_methods': payment_methods
        })

    except Exception as e:
        return Response(
            {'error': f'Analytics generation failed: {str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def inventory_analytics(request):
    """
    Generate inventory analytics and insights
    """
    try:
        with connection.cursor() as cursor:
            # Get inventory overview
            cursor.execute("""
                SELECT 
                    p.id,
                    p.name,
                    p.sku,
                    p.current_stock,
                    p.min_stock,
                    p.max_stock,
                    p.price,
                    p.cost,
                    c.name as category_name,
                    s.name as supplier_name,
                    COALESCE(sales_qty.total_sold, 0) as total_sold,
                    COALESCE(purchase_qty.total_purchased, 0) as total_purchased
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                LEFT JOIN suppliers s ON p.supplier_id = s.id
                LEFT JOIN (
                    SELECT si.product_id, SUM(si.quantity) as total_sold
                    FROM sale_items si
                    JOIN sales sa ON si.sale_id = sa.id
                    WHERE sa.payment_status = 'COMPLETED'
                        AND sa.created_at >= NOW() - INTERVAL '30 days'
                    GROUP BY si.product_id
                ) sales_qty ON p.id = sales_qty.product_id
                LEFT JOIN (
                    SELECT pi.product_id, SUM(pi.quantity) as total_purchased
                    FROM purchase_items pi
                    JOIN purchases pu ON pi.purchase_id = pu.id
                    WHERE pu.status = 'DELIVERED'
                        AND pu.created_at >= NOW() - INTERVAL '30 days'
                    GROUP BY pi.product_id
                ) purchase_qty ON p.id = purchase_qty.product_id
                WHERE p.status = 'ACTIVE'
            """)
            
            inventory_data = cursor.fetchall()

        df = pd.DataFrame(inventory_data, columns=[
            'id', 'name', 'sku', 'current_stock', 'min_stock', 'max_stock',
            'price', 'cost', 'category_name', 'supplier_name', 'total_sold', 'total_purchased'
        ])

        if df.empty:
            return Response({
                'total_products': 0,
                'low_stock_items': [],
                'out_of_stock_items': [],
                'top_selling_products': [],
                'inventory_value': 0,
                'turnover_ratio': 0,
                'charts': {}
            })

        # Calculate metrics
        total_products = len(df)
        low_stock_items = df[df['current_stock'] <= df['min_stock']].to_dict('records')
        out_of_stock_items = df[df['current_stock'] == 0].to_dict('records')
        top_selling_products = df.nlargest(10, 'total_sold')[['name', 'total_sold']].to_dict('records')
        
        # Inventory value
        df['inventory_value'] = df['current_stock'] * df['cost']
        total_inventory_value = float(df['inventory_value'].sum())
        
        # Inventory turnover ratio (simplified)
        avg_inventory = df['current_stock'].mean()
        total_sold = df['total_sold'].sum()
        turnover_ratio = float(total_sold / avg_inventory) if avg_inventory > 0 else 0

        # Create charts
        charts = {}
        
        # Stock levels by category
        category_stock = df.groupby('category_name')['current_stock'].sum().reset_index()
        category_chart = px.pie(
            category_stock, 
            values='current_stock', 
            names='category_name',
            title='Stock Distribution by Category'
        )
        charts['category_distribution'] = json.loads(json.dumps(category_chart, cls=PlotlyJSONEncoder))

        # Low stock alert chart
        alert_data = pd.DataFrame({
            'Status': ['Low Stock', 'Out of Stock', 'Normal'],
            'Count': [
                len(low_stock_items),
                len(out_of_stock_items),
                total_products - len(low_stock_items) - len(out_of_stock_items)
            ]
        })
        
        alert_chart = px.bar(
            alert_data,
            x='Status',
            y='Count',
            color='Status',
            color_discrete_map={
                'Low Stock': '#ff9800',
                'Out of Stock': '#f44336',
                'Normal': '#4caf50'
            },
            title='Inventory Status Overview'
        )
        charts['inventory_status'] = json.loads(json.dumps(alert_chart, cls=PlotlyJSONEncoder))

        return Response({
            'total_products': total_products,
            'low_stock_items': low_stock_items,
            'out_of_stock_items': out_of_stock_items,
            'top_selling_products': top_selling_products,
            'inventory_value': total_inventory_value,
            'turnover_ratio': turnover_ratio,
            'charts': charts
        })

    except Exception as e:
        return Response(
            {'error': f'Inventory analytics failed: {str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def financial_analytics(request):
    """
    Generate financial analytics and cash flow insights
    """
    try:
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')
        
        # Default to last 90 days if no dates provided
        if not end_date:
            end_date = datetime.now().date()
        else:
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
            
        if not start_date:
            start_date = end_date - timedelta(days=90)
        else:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()

        with connection.cursor() as cursor:
            # Sales revenue
            cursor.execute("""
                SELECT 
                    DATE(created_at) as date,
                    SUM(total) as revenue,
                    SUM(subtotal) as subtotal,
                    SUM(tax_amount) as tax
                FROM sales
                WHERE created_at >= %s AND created_at <= %s
                    AND payment_status = 'COMPLETED'
                GROUP BY DATE(created_at)
                ORDER BY date
            """, [start_date, end_date])
            sales_data = cursor.fetchall()

            # Purchase costs
            cursor.execute("""
                SELECT 
                    DATE(created_at) as date,
                    SUM(total) as costs
                FROM purchases
                WHERE created_at >= %s AND created_at <= %s
                    AND status IN ('DELIVERED', 'CONFIRMED')
                GROUP BY DATE(created_at)
                ORDER BY date
            """, [start_date, end_date])
            purchase_data = cursor.fetchall()

        # Convert to DataFrames
        sales_df = pd.DataFrame(sales_data, columns=['date', 'revenue', 'subtotal', 'tax'])
        purchase_df = pd.DataFrame(purchase_data, columns=['date', 'costs'])

        # Merge data
        if not sales_df.empty and not purchase_df.empty:
            financial_df = pd.merge(sales_df, purchase_df, on='date', how='outer').fillna(0)
        elif not sales_df.empty:
            financial_df = sales_df.copy()
            financial_df['costs'] = 0
        elif not purchase_df.empty:
            financial_df = purchase_df.copy()
            financial_df['revenue'] = 0
            financial_df['subtotal'] = 0
            financial_df['tax'] = 0
        else:
            return Response({
                'total_revenue': 0,
                'total_costs': 0,
                'gross_profit': 0,
                'profit_margin': 0,
                'cash_flow': [],
                'charts': {}
            })

        # Calculate metrics
        financial_df['profit'] = financial_df['revenue'] - financial_df['costs']
        financial_df['cash_flow'] = financial_df['profit'].cumsum()

        total_revenue = float(financial_df['revenue'].sum())
        total_costs = float(financial_df['costs'].sum())
        gross_profit = total_revenue - total_costs
        profit_margin = (gross_profit / total_revenue * 100) if total_revenue > 0 else 0

        # Create charts
        charts = {}
        
        # Cash flow chart
        cash_flow_chart = go.Figure()
        cash_flow_chart.add_trace(go.Scatter(
            x=financial_df['date'],
            y=financial_df['cash_flow'],
            mode='lines+markers',
            name='Cumulative Cash Flow',
            line=dict(color='#2e7d32', width=3)
        ))
        cash_flow_chart.update_layout(
            title='Cash Flow Trend',
            xaxis_title='Date',
            yaxis_title='Cash Flow ($)',
            template='plotly_white'
        )
        charts['cash_flow'] = json.loads(json.dumps(cash_flow_chart, cls=PlotlyJSONEncoder))

        # Revenue vs Costs
        revenue_costs_chart = go.Figure()
        revenue_costs_chart.add_trace(go.Scatter(
            x=financial_df['date'],
            y=financial_df['revenue'],
            mode='lines+markers',
            name='Revenue',
            line=dict(color='#1976d2')
        ))
        revenue_costs_chart.add_trace(go.Scatter(
            x=financial_df['date'],
            y=financial_df['costs'],
            mode='lines+markers',
            name='Costs',
            line=dict(color='#d32f2f')
        ))
        revenue_costs_chart.update_layout(
            title='Revenue vs Costs',
            xaxis_title='Date',
            yaxis_title='Amount ($)',
            template='plotly_white'
        )
        charts['revenue_costs'] = json.loads(json.dumps(revenue_costs_chart, cls=PlotlyJSONEncoder))

        return Response({
            'total_revenue': total_revenue,
            'total_costs': total_costs,
            'gross_profit': gross_profit,
            'profit_margin': profit_margin,
            'cash_flow': financial_df[['date', 'cash_flow']].to_dict('records'),
            'charts': charts
        })

    except Exception as e:
        return Response(
            {'error': f'Financial analytics failed: {str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )